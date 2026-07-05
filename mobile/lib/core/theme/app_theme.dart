import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme.dart';

/// Design-system colors from PHASE_10_SPEC section 1.2.
///
/// The dark palette intentionally reuses [NorthColors] (the palette every
/// screen already renders with since Phase 9) so switching `themeMode` to
/// dark is a no-op for existing visuals. Screens that read `NorthColors.*`
/// directly (all of Phase 9) won't repaint when the light theme is
/// selected — only widgets that read `Theme.of(context)` do. Retrofitting
/// every existing screen to theme-aware colors is out of scope here; this
/// wires up the toggle + persistence machinery the spec asks for without
/// silently reskinning screens that were never built to be theme-aware.
class AppTheme {
  static const Color primaryLight = Color(0xFF2563EB); // blue-600
  static const Color primaryDark = Color(0xFF3B82F6); // blue-500
  static const Color bgLight = Color(0xFFF8FAFC); // slate-50
  static const Color bgDark = Color(0xFF0F172A); // slate-900
  static const Color cardLight = Color(0xFFFFFFFF);
  static const Color cardDark = Color(0xFF1E293B); // slate-800
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B); // slate-500
  static const Color success = Color(0xFF16A34A); // green-600
  static const Color danger = Color(0xFFDC2626); // red-600
  static const Color warning = Color(0xFFD97706); // amber-600

  static ThemeData light() {
    return ThemeData(
      brightness: Brightness.light,
      scaffoldBackgroundColor: bgLight,
      colorScheme: const ColorScheme.light(
        primary: primaryLight,
        surface: cardLight,
        error: danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgLight,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: cardLight,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryLight,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: cardLight,
        selectedItemColor: primaryLight,
        unselectedItemColor: textSecondary,
      ),
    );
  }

  /// Dark theme — same palette every screen already renders with
  /// ([NorthColors]), just exposed through the standard [ThemeData] surface
  /// so `AppTheme`-aware widgets (new Phase 10 widgets) match it exactly.
  static ThemeData dark() => northTheme();
}

// ---------------------------------------------------------------------------
// Persistence + toggle
// ---------------------------------------------------------------------------
const _themeModePrefsKey = 'app_theme_mode';

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController() : super(ThemeMode.dark) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_themeModePrefsKey);
    if (saved == 'light') {
      state = ThemeMode.light;
    } else if (saved == 'system') {
      state = ThemeMode.system;
    } else {
      state = ThemeMode.dark;
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeModePrefsKey, mode.name);
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(),
);
