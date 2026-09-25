/// Address of the Mac running North OS. Normally set by pairing (Setup
/// screen) and kept in secure storage; this only pre-fills the field, e.g.
///   flutter run --dart-define=SERVER_URL=http://100.101.1.2:9847
const kDefaultServerUrl = String.fromEnvironment('SERVER_URL', defaultValue: '');

/// "prod" or "uat" (--dart-define=CHANNEL=uat). UAT is a separate app that
/// pairs with the UAT desktop build (port 9848) — test data only.
const kChannel = String.fromEnvironment('CHANNEL', defaultValue: 'prod');
const kIsUat = kChannel == 'uat';

/// Desktop app's port for this channel, used when an address has no port.
const kDesktopPort = kIsUat ? 9848 : 9847;
