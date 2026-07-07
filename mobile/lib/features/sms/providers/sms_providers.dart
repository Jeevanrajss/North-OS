import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../data/bank_sms_parser.dart';
import '../data/sms_import_service.dart';
import '../data/sms_repository.dart';

final smsRepositoryProvider = Provider<SmsRepository>((ref) => SmsRepository());

final bankSmsParserProvider = Provider<BankSmsParser>(
  (ref) => BankSmsParser(), // no dependencies — fully offline, regex-only
);

final smsImportServiceProvider = Provider<SmsImportService>(
  (ref) => SmsImportService(ref.read(dioProvider), ref.read(bankSmsParserProvider)),
);
