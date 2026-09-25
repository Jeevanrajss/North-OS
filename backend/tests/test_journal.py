"""Journal: days, moods, tags, entries, calendar, stats, export, AI summary/tags, search."""
from datetime import date, timedelta

from conftest import API

TODAY = date.today()
D = TODAY.isoformat()


def _entry(client, d=D, text="Went for a long walk and finished the book.", headers=None):
    r = client.post(f"{API}/journal/days/{d}/entries", json={"content_json": "{}", "content_text": text}, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


class TestDays:
    def test_get_day_creates_empty_day(self, client):
        day = client.get(f"{API}/journal/days/{D}").json()
        assert day["date"] == D and day["entries"] == [] and day["mood_codes"] == []

    def test_patch_moods_and_tags(self, client):
        day = client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["calm", "focused"], "tags": [" Deep-Work ", "", "family"]}).json()
        assert day["mood_codes"] == ["calm", "focused"]
        assert day["tags"] == ["deep-work", "family"]
        assert "deep-work" in [t["name"] for t in client.get(f"{API}/journal/tags").json()]

    def test_unknown_mood_rejected(self, client):
        assert client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["ecstatic"]}).status_code == 400

    def test_summary_fields_and_clearing_with_empty_string(self, client):
        day = client.patch(f"{API}/journal/days/{D}", json={"summary_wins": "Shipped it"}).json()
        assert day["summary_wins"] == "Shipped it" and day["has_summary"] is True
        day = client.patch(f"{API}/journal/days/{D}", json={"summary_wins": ""}).json()
        assert day["summary_wins"] is None

    def test_moods_reference_list(self, client):
        codes = [m["code"] for m in client.get(f"{API}/journal/moods").json()]
        assert codes[0] == "grateful" and "anxious" in codes


class TestEntries:
    def test_create_update_delete(self, client):
        e = _entry(client)
        assert client.get(f"{API}/journal/days/{D}").json()["entries"][0]["id"] == e["id"]
        upd = client.put(f"{API}/journal/entries/{e['id']}", json={"content_json": "{}", "content_text": "edited"})
        assert upd.json()["content_text"] == "edited"
        assert client.delete(f"{API}/journal/entries/{e['id']}").status_code == 204
        assert client.get(f"{API}/journal/days/{D}").json()["entries"] == []
        assert client.put(f"{API}/journal/entries/{e['id']}", json={"content_text": "x"}).status_code == 404

    def test_entries_ordered_by_creation(self, client):
        a, b = _entry(client, text="first"), _entry(client, text="second")
        ids = [x["id"] for x in client.get(f"{API}/journal/days/{D}").json()["entries"]]
        assert ids == [a["id"], b["id"]]

    def test_saving_entry_works_with_llm_offline(self, client):
        """Embedding runs on save; LM Studio being down must not block writing."""
        assert _entry(client)["id"]


class TestCalendarStatsExport:
    def test_calendar_fills_every_day_and_scores_valence(self, client):
        client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["grateful", "tired"]})
        _entry(client)
        start = (TODAY - timedelta(days=2)).isoformat()
        cells = client.get(f"{API}/journal/calendar", params={"start": start, "end": D}).json()["cells"]
        assert len(cells) == 3
        assert cells[-1]["entry_count"] == 1 and cells[-1]["valence_avg"] == 0.5
        assert cells[0]["entry_count"] == 0 and cells[0]["valence_avg"] is None

    def test_calendar_validation(self, client):
        assert client.get(f"{API}/journal/calendar", params={"start": D, "end": (TODAY - timedelta(days=1)).isoformat()}).status_code == 400
        assert client.get(f"{API}/journal/calendar", params={"start": "2020-01-01", "end": "2022-01-01"}).status_code == 400

    def test_stats_streak_and_top_tags(self, client):
        for i in range(3):
            d = (TODAY - timedelta(days=i)).isoformat()
            _entry(client, d=d)
            client.patch(f"{API}/journal/days/{d}", json={"tags": ["work"] if i < 2 else ["rest"]})
        s = client.get(f"{API}/journal/stats").json()
        assert s["current_streak"] == 3 and s["active_days"] == 3 and s["total_entries"] == 3
        assert s["top_tags"][0] == {"name": "work", "count": 2}

    def test_deleted_entry_not_counted_in_stats(self, client):
        e = _entry(client)
        client.delete(f"{API}/journal/entries/{e['id']}")
        assert client.get(f"{API}/journal/stats").json()["total_entries"] == 0

    def test_export_markdown(self, client):
        client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["calm"], "tags": ["walk"], "summary_highlights": "Sunset"})
        _entry(client, text="Evening stroll by the lake.")
        r = client.get(f"{API}/journal/export", params={"start": D, "end": D})
        assert r.status_code == 200
        assert "attachment" in r.headers["content-disposition"]
        body = r.text
        assert "**Mood:** calm" in body and "#walk" in body and "**Highlights:** Sunset" in body
        assert "Evening stroll by the lake." in body

    def test_export_skips_empty_days_and_limits_range(self, client):
        client.get(f"{API}/journal/days/{D}")  # creates an empty day
        assert "##" not in client.get(f"{API}/journal/export", params={"start": D, "end": D}).text
        assert client.get(f"{API}/journal/export", params={"start": "2020-01-01", "end": "2022-01-01"}).status_code == 400

    def test_mood_habit_correlation(self, client):
        h = client.post(f"{API}/habits", json={"name": "Run"}).json()
        good, bad = TODAY, TODAY - timedelta(days=1)
        client.put(f"{API}/habits/{h['id']}/checkins/{good.isoformat()}")
        client.patch(f"{API}/journal/days/{good.isoformat()}", json={"mood_codes": ["content"]})
        client.patch(f"{API}/journal/days/{bad.isoformat()}", json={"mood_codes": ["drained"]})
        c = client.get(f"{API}/journal/mood-habits").json()["correlations"][0]
        assert c["avg_mood_with"] == 2 and c["avg_mood_without"] == -2 and c["mood_lift"] == 4

    def test_annual_review_has_twelve_months(self, client):
        assert len(client.get(f"{API}/journal/annual").json()["months"]) == 12


class TestAiFeatures:
    def test_summarize_fills_fields_from_llm_json(self, client, fake_llm):
        _entry(client, text="Long day of coding, finally fixed the sync bug. Grateful for coffee.")
        fake_llm.reply = '```json\n{"highlights": "Fixed sync", "wins": "Bug squashed", "learnings": null, "gratitude": "Coffee"}\n```'
        day = client.post(f"{API}/journal/days/{D}/summarize").json()
        assert day["summary_highlights"] == "Fixed sync"
        assert day["summary_learnings"] is None
        assert day["summary_gratitude"] == "Coffee"

    def test_summarize_with_llm_offline_keeps_manual_summary(self, client):
        """Regression: an offline LLM used to wipe the summary the user wrote by hand."""
        _entry(client, text="Wrote a long entry about the trip to the hills today.")
        client.patch(f"{API}/journal/days/{D}", json={"summary_wins": "Climbed the peak"})
        r = client.post(f"{API}/journal/days/{D}/summarize")
        assert r.status_code == 200
        assert r.json()["summary_wins"] == "Climbed the peak"

    def test_suggest_tags_filters_existing_and_caps_at_five(self, client, fake_llm):
        client.patch(f"{API}/journal/days/{D}", json={"tags": ["work"]})
        _entry(client, text="Busy day at work, then gym and cooking dinner with family.")
        fake_llm.reply = "Work, gym, cooking, family, health, reading, travel"
        out = client.post(f"{API}/journal/days/{D}/suggest-tags").json()
        assert out["reason"] == "ok"
        assert "work" not in out["suggestions"]
        assert 1 <= len(out["suggestions"]) <= 5

    def test_suggest_tags_too_short(self, client, fake_llm):
        out = client.post(f"{API}/journal/days/{D}/suggest-tags").json()
        assert out["suggestions"] == [] and out["reason"] == "too_short"
        assert fake_llm.calls == []

    def test_suggest_tags_llm_offline(self, client):
        _entry(client, text="A reasonably long entry about nothing in particular.")
        out = client.post(f"{API}/journal/days/{D}/suggest-tags").json()
        assert out["reason"] == "llm_error" and out["suggestions"] == []

    def test_search_with_llm_offline_returns_empty(self, client):
        _entry(client)
        assert client.post(f"{API}/journal/search", json={"query": "walk"}).json() == []


class TestIsolation:
    def test_other_user_cannot_read_or_edit_entries(self, client, user_a, user_b):
        e = _entry(client, headers=user_a)
        assert client.get(f"{API}/journal/days/{D}", headers=user_b).json()["entries"] == []
        assert client.put(f"{API}/journal/entries/{e['id']}", json={"content_text": "hacked"}, headers=user_b).status_code == 404
        assert client.delete(f"{API}/journal/entries/{e['id']}", headers=user_b).status_code == 404

    def test_two_users_can_journal_the_same_date(self, client, user_a, user_b):
        client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["calm"]}, headers=user_a)
        r = client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["sad"]}, headers=user_b)
        assert r.status_code == 200
        assert client.get(f"{API}/journal/days/{D}", headers=user_a).json()["mood_codes"] == ["calm"]
