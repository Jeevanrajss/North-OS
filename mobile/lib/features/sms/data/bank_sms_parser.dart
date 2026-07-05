import 'package:dio/dio.dart';
import '../models/parsed_transaction.dart';

/// Parses one bank SMS into a [ParsedTransaction].
///
/// Strategy: send the raw SMS to the backend `/sms/parse` endpoint (Gemini
/// Flash or the user's configured LLM provider parses it). Falls back to a
/// local regex parser if the backend call fails (offline, LLM unavailable,
/// etc.) so the app degrades gracefully rather than losing the SMS entirely.
class BankSmsParser {
  final Dio _dio;
  BankSmsParser(this._dio);

  Future<ParsedTransaction?> parse(String body, String sender) async {
    try {
      final response = await _dio.post('/sms/parse', data: {'body': body, 'sender': sender});
      final data = response.data as Map<String, dynamic>;
      if (data['is_transaction'] == true) {
        return ParsedTransaction.fromJson(data, body);
      }
      return null; // backend says this SMS isn't a transaction
    } catch (_) {
      return _parseWithRegex(body);
    }
  }

  ParsedTransaction? _parseWithRegex(String body) {
    final amountRegex = RegExp(
      r'(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
      caseSensitive: false,
    );
    final debitWords = RegExp(r'\b(debited|spent|paid|withdrawn|deducted|debit)\b', caseSensitive: false);
    final creditWords = RegExp(r'\b(credited|received|deposited|refund|credit)\b', caseSensitive: false);
    final accountRegex = RegExp(r'[Aa]\/[Cc]\s*(?:[Xx*]+)?(\d{4})', caseSensitive: false);
    final balanceRegex = RegExp(
      r'(?:Bal(?:ance)?|Avl Bal|Available Bal):?\s*(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
      caseSensitive: false,
    );

    final amountMatch = amountRegex.firstMatch(body);
    if (amountMatch == null) return null;

    final amountStr = amountMatch.group(1)!.replaceAll(',', '');
    final amount = double.tryParse(amountStr);
    if (amount == null || amount <= 0) return null;

    final direction = debitWords.hasMatch(body)
        ? 'debit'
        : creditWords.hasMatch(body)
            ? 'credit'
            : 'debit'; // default to debit if ambiguous

    final account = accountRegex.firstMatch(body)?.group(1);
    final balanceStr = balanceRegex.firstMatch(body)?.group(1)?.replaceAll(',', '');
    final balance = balanceStr != null ? double.tryParse(balanceStr) : null;

    return ParsedTransaction(
      amount: amount,
      direction: direction,
      merchant: _extractMerchant(body),
      accountLast4: account,
      balanceAfter: balance,
      category: null, // regex can't categorize reliably
      rawSms: body,
    );
  }

  String _extractMerchant(String body) {
    final patterns = [
      RegExp(r'at\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
      RegExp(r'to\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
      RegExp(r'for\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(body);
      if (m != null) return m.group(1)!.trim();
    }
    return 'Unknown';
  }
}
