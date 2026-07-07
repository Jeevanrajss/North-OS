import '../models/parsed_transaction.dart';

/// Parses one bank SMS into a [ParsedTransaction] using local regex only.
///
/// PRIVACY RULE (PHASE_10_SPEC.md §2.4): no cloud AI call of any kind —
/// no Gemini, no OpenAI, no backend round-trip. This class has zero network
/// dependencies. Bank account numbers, balances, and full SMS text never
/// leave the device.
class BankSmsParser {
  Future<ParsedTransaction?> parse(String body, String sender) async {
    return _parseWithRegex(body);
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
