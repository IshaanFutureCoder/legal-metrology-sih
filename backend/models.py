from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(30), nullable=False)


class Instrument(db.Model):
    __tablename__ = "instruments"

    id = db.Column(db.Integer, primary_key=True)
    instrument_number = db.Column(db.String(50), unique=True, nullable=False)
    instrument_type = db.Column(db.String(100), nullable=False)
    manufacturer = db.Column(db.String(100), nullable=False)
    model_number = db.Column(db.String(100), nullable=False)
    serial_number = db.Column(db.String(100), unique=True, nullable=False)
    capacity = db.Column(db.String(50), nullable=False)
    location = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="PENDING")
    verification_due_date = db.Column(db.Date, nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


class VerificationApplication(db.Model):
    __tablename__ = "verification_applications"

    id = db.Column(db.Integer, primary_key=True)
    application_number = db.Column(db.String(50), unique=True, nullable=False)
    instrument_id = db.Column(db.Integer, db.ForeignKey("instruments.id"), nullable=False)
    applicant_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    application_type = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="SUBMITTED")
    submitted_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    scheduled_date = db.Column(db.Date, nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)


class VerificationResult(db.Model):
    __tablename__ = "verification_results"

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("verification_applications.id"), nullable=False)
    officer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    result = db.Column(db.String(30), nullable=False)
    observations = db.Column(db.Text, nullable=True)
    verified_at = db.Column(db.DateTime, nullable=False, default=db.func.now())


class Certificate(db.Model):
    __tablename__ = "certificates"

    id = db.Column(db.Integer, primary_key=True)
    certificate_number = db.Column(db.String(50), unique=True, nullable=False)
    application_id = db.Column(db.Integer, db.ForeignKey("verification_applications.id"), nullable=False)
    instrument_id = db.Column(db.Integer, db.ForeignKey("instruments.id"), nullable=False)
    issued_to = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    issue_date = db.Column(db.Date, nullable=False)
    valid_until = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE")
