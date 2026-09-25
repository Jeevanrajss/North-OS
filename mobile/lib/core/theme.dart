import 'package:flutter/material.dart';

/// Bottom padding for scrollable pages so the last item clears the docked
/// Quick Log FAB and the bottom nav.
const kFabClearance = 96.0;

/// One set of colour roles, in a dark and a light variant. Roles, not hues:
/// fg1 primary text → fg3 strong secondary → fg4 secondary → fg5 tertiary,
/// fg6 decorative only. Every text role clears WCAG AA (4.5:1) on bg1, card
/// and bg3 in both variants; status colours are darkened for light mode so
/// they stay readable as text on white.
class NorthPalette {
  final Brightness brightness;
  final Color bg1, bg2, bg3, card, border1, border2;
  final Color fg1, fg3, fg4, fg5, fg6;
  final Color accent, accentMuted, green, red, amber, blue;

  const NorthPalette({
    required this.brightness,
    required this.bg1,
    required this.bg2,
    required this.bg3,
    required this.card,
    required this.border1,
    required this.border2,
    required this.fg1,
    required this.fg3,
    required this.fg4,
    required this.fg5,
    required this.fg6,
    required this.accent,
    required this.accentMuted,
    required this.green,
    required this.red,
    required this.amber,
    required this.blue,
  });

  static const dark = NorthPalette(
    brightness: Brightness.dark,
    bg1: Color(0xFF0A0D14),
    bg2: Color(0xFF0E1018),
    bg3: Color(0xFF151827),
    card: Color(0xFF151827),
    border1: Color(0x0DFFFFFF),
    border2: Color(0x14FFFFFF),
    fg1: Color(0xFFF0F0F5),
    fg3: Color(0xFFB0B8C9),
    fg4: Color(0xFF98A1B3),
    fg5: Color(0xFF7A8398),
    fg6: Color(0xFF3A4254),
    accent: Color(0xFF8B7CFF),
    accentMuted: Color(0x1A8B7CFF),
    green: Color(0xFF3DFF98),
    red: Color(0xFFFF5C5C),
    amber: Color(0xFFFFBE3D),
    blue: Color(0xFF3EBEFF),
  );

  static const light = NorthPalette(
    brightness: Brightness.light,
    bg1: Color(0xFFF5F6FA),
    bg2: Color(0xFFFFFFFF),
    bg3: Color(0xFFECEEF3),
    card: Color(0xFFFFFFFF),
    border1: Color(0xFFE6E8EF),
    border2: Color(0xFFD5DAE3),
    fg1: Color(0xFF0F1320),
    fg3: Color(0xFF303748),
    fg4: Color(0xFF4F5869),
    fg5: Color(0xFF636B7C),
    fg6: Color(0xFFD0D5DE),
    accent: Color(0xFF5B4BD6),
    accentMuted: Color(0x1A5B4BD6),
    green: Color(0xFF0B8043),
    red: Color(0xFFD02E2E),
    amber: Color(0xFFA35F00),
    blue: Color(0xFF0A6FB0),
  );

  static NorthPalette of(Brightness b) => b == Brightness.dark ? dark : light;
}

/// The active palette's colours. Screens read these directly (no
/// BuildContext needed); [NorthThemeSync] in app.dart switches the active
/// palette when the app's brightness changes and rebuilds the tree.
class NorthColors {
  static NorthPalette current = NorthPalette.dark;
  static bool get isDark => current.brightness == Brightness.dark;

  static Color get bg1 => current.bg1;
  static Color get bg2 => current.bg2;
  static Color get bg3 => current.bg3;
  static Color get card => current.card;
  static Color get border1 => current.border1;
  static Color get border2 => current.border2;
  static Color get fg1 => current.fg1;
  static Color get fg3 => current.fg3;
  static Color get fg4 => current.fg4;
  static Color get fg5 => current.fg5;
  // Decorative only (empty rings, dividers, tracks) — never for text.
  static Color get fg6 => current.fg6;
  static Color get accent => current.accent;
  static Color get accentMuted => current.accentMuted;
  static Color get green => current.green;
  static Color get red => current.red;
  static Color get amber => current.amber;
  static Color get blue => current.blue;
}

/// 4-pt spacing scale — use these instead of ad-hoc numbers so rhythm stays
/// consistent across screens.
class NorthSpace {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const page = EdgeInsets.fromLTRB(lg, sm, lg, kFabClearance);
}

/// Type scale. Numbers use tabular figures so amounts line up in columns.
class NorthText {
  static const _tabular = [FontFeature.tabularFigures()];
  static TextStyle get display =>
      TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: NorthColors.fg1, height: 1.15);
  static TextStyle get title => TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: NorthColors.fg1);
  static TextStyle get section => TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1);
  static TextStyle get body => TextStyle(fontSize: 14, color: NorthColors.fg1);
  static TextStyle get bodyMuted => TextStyle(fontSize: 14, color: NorthColors.fg4);
  static TextStyle get label => TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: NorthColors.fg4);
  static TextStyle get caption => TextStyle(fontSize: 11, color: NorthColors.fg5);
  static TextStyle get overline =>
      TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: NorthColors.fg5, letterSpacing: 0.8);
  static const statValue = TextStyle(fontSize: 18, fontWeight: FontWeight.w700, fontFeatures: _tabular);
  static const amount = TextStyle(fontSize: 14, fontWeight: FontWeight.w600, fontFeatures: _tabular);
}

ThemeData northTheme([NorthPalette p = NorthPalette.dark]) {
  final dark = p.brightness == Brightness.dark;
  return ThemeData(
    brightness: p.brightness,
    scaffoldBackgroundColor: p.bg1,
    colorScheme: (dark ? const ColorScheme.dark() : const ColorScheme.light()).copyWith(
      primary: p.accent,
      onPrimary: Colors.white,
      secondary: p.accent,
      onSecondary: Colors.white,
      secondaryContainer: p.accent.withValues(alpha: dark ? 0.16 : 0.12),
      onSecondaryContainer: p.accent,
      surface: p.bg2,
      onSurface: p.fg1,
      onSurfaceVariant: p.fg4,
      outline: p.border2,
      outlineVariant: p.border1,
      surfaceContainerHighest: p.bg3,
      error: p.red,
    ),
    dividerColor: p.border1,
    appBarTheme: AppBarTheme(
      backgroundColor: p.bg1,
      foregroundColor: p.fg1,
      elevation: 0,
      // No M3 tint band when content scrolls under the bar.
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      // Page title tops the hierarchy — heavier than any card heading.
      titleTextStyle: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: p.fg1, letterSpacing: -0.2),
    ),
    cardTheme: CardThemeData(
      color: p.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: p.border1),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.bg2,
      modalBackgroundColor: p.bg2,
      surfaceTintColor: Colors.transparent,
    ),
    dialogTheme: DialogThemeData(backgroundColor: p.bg2, surfaceTintColor: Colors.transparent),
    chipTheme: ChipThemeData(
      backgroundColor: p.bg3,
      selectedColor: p.accent.withValues(alpha: dark ? 0.16 : 0.12),
      side: BorderSide(color: p.border2),
      labelStyle: TextStyle(color: p.fg3, fontWeight: FontWeight.w500),
      secondaryLabelStyle: TextStyle(color: p.accent, fontWeight: FontWeight.w600),
      checkmarkColor: p.accent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: p.accent,
      unselectedLabelColor: p.fg4,
      indicatorColor: p.accent,
      dividerColor: p.border1,
    ),
    listTileTheme: ListTileThemeData(iconColor: p.fg4, textColor: p.fg1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.bg3,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.border2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.border2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.accent),
      ),
      hintStyle: TextStyle(color: p.fg5),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: p.accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: p.accent, foregroundColor: Colors.white),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: p.accent)),
    floatingActionButtonTheme: FloatingActionButtonThemeData(backgroundColor: p.accent, foregroundColor: Colors.white),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: p.accent, linearTrackColor: p.fg6),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: p.bg2,
      selectedItemColor: p.accent,
      unselectedItemColor: p.fg5,
    ),
    snackBarTheme: SnackBarThemeData(
      // Inverted surface so it stands out in both modes.
      backgroundColor: dark ? p.bg3 : const Color(0xFF1B2030),
      contentTextStyle: TextStyle(color: dark ? p.fg1 : Colors.white),
      actionTextColor: dark ? p.accent : const Color(0xFFB4AAFF),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
