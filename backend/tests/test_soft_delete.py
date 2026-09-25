"""Deletes are soft (deleted_at tombstones) and hidden from every ORM query."""
from datetime import date

from conftest import API

D = date.today().isoformat()


class TestSoftDeleteFilter:
    def test_soft_deleted_rows_hidden_from_orm_but_visible_with_opt_in(self, client, db):
        from app.models.contact import Contact

        c = client.post(f"{API}/contacts", json={"name": "Temp"}).json()
        client.delete(f"{API}/contacts/{c['id']}")
        assert db.query(Contact).filter_by(id=c["id"]).first() is None
        assert db.query(Contact).filter_by(id=c["id"]).execution_options(include_deleted=True).first() is not None

    def test_deleted_transaction_excluded_everywhere(self, client):
        t = client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 777, "date": D, "category": "Shopping"}).json()
        client.post(f"{API}/finance/budgets", json={"category": "Shopping", "amount": 100})
        client.delete(f"{API}/finance/transactions/{t['id']}")
        assert client.get(f"{API}/finance/budgets/status").json()[0]["spent"] == 0
        today = date.today()
        assert client.get(f"{API}/finance/summary/{today.year}/{today.month}").json()["transaction_count"] == 0
