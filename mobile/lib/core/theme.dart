import 'package:flutter/material.dart';

class NorthColors {
  static const bg1 = Color(0xFF0A0D14);
  static const bg2 = Color(0xFF0E1018);
  static const bg3 = Color(0xFF151827);
  static const border1 = Color(0x0DFFFFFF);
  static const border2 = Color(0x14FFFFFF);
  static const fg1 = Color(0xFFF0F0F5);
  static const fg3 = Color(0xFFB0B8C9);
  static const fg4 = Color(0xFF7B8498);
  static const fg5 = Color(0xFF525C6E);
  static const accent = Color(0xFF8B7CFF);
  static const accentMuted = Color(0x1A8B7CFF);
  static const green = Color(0xFF3DFF98);
  static const red = Color(0xFFFF5C5C);
  static const amber = Color(0xFFFFBE3D);
  static const blue = Color(0xFF3EBEFF);
  static const card = Color(0xFF151827);
}

ThemeData northTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: NorthColors.bg1,
    colorScheme: const ColorScheme.dark(
      primary: NorthColors.accent,
      surface: NorthColors.bg2,
      error: NorthColors.red,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: NorthColors.bg1,
      foregroundColor: NorthColors.fg1,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: const CardThemeData(
      color: NorthColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: NorthColors.border1),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: NorthColors.bg3,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: NorthColors.border2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: NorthColors.border2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: NorthColors.accent),
      ),
      hintStyle: const TextStyle(color: NorthColors.fg5),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: NorthColors.accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: NorthColors.accent),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: NorthColors.bg2,
      selectedItemColor: NorthColors.accent,
      unselectedItemColor: NorthColors.fg5,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: NorthColors.bg3,
      contentTextStyle: const TextStyle(color: NorthColors.fg1),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
