import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

/// Web-safe platform check — `Platform` throws on web.
bool get isAndroid => !kIsWeb && Platform.isAndroid;
