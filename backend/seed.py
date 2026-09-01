from app import app
from models import db, User
from werkzeug.security import generate_password_hash


def create_user(name, email, password, role):
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        print(f"{email} already exists.")
        return

    db.session.add(User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role=role
    ))
    print(f"Created {role}: {email}")


with app.app_context():
    db.create_all()

    create_user("System Administrator", "admin@legalmetrology.gov", "admin123", "ADMIN")
    create_user("Legal Metrology Officer", "lmo@legalmetrology.gov", "lmo123", "LMO")
    create_user("Government Approved Test Centre", "gatc@legalmetrology.gov", "gatc123", "GATC")
    create_user("Instrument Owner", "owner@example.com", "owner123", "OWNER")

    db.session.commit()
    print("Demo users created successfully.")
