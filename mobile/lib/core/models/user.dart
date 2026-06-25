class User {
  final String id;
  final String name;
  final String email;
  final String createdAt;

  User({required this.id, required this.name, required this.email, required this.createdAt});

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        createdAt: json['created_at'] as String,
      );
}
