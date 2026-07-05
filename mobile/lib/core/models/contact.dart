class Contact {
  final String id;
  final String name;
  final String? phone;
  final String? upiId;
  final String? notes;

  Contact({required this.id, required this.name, this.phone, this.upiId, this.notes});

  factory Contact.fromJson(Map<String, dynamic> json) => Contact(
        id: json['id'] as String,
        name: json['name'] as String,
        phone: json['phone'] as String?,
        upiId: json['upi_id'] as String?,
        notes: json['notes'] as String?,
      );
}
