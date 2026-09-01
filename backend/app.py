import os
from flask import Flask, request, send_from_directory
from flask_cors import CORS

from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

from functools import wraps
from datetime import date, datetime, timedelta
from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)
from werkzeug.utils import secure_filename

from sqlalchemy import or_

from models import (
    db,
    User,
    Instrument,
    VerificationApplication,
    VerificationResult,
    Certificate
)

import qrcode
import os
import uuid


# ============================================================
# APPLICATION SETUP
# ============================================================

app = Flask(__name__)
CORS(app)

# -------------------------
# Database configuration
# -------------------------

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///database.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False


# -------------------------
# JWT configuration
# -------------------------

app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY",
    "dev-only-change-this-secret"
)


# -------------------------
# File upload configuration
# -------------------------

app.config["UPLOAD_FOLDER"] = "uploads"

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "pdf",
    "doc",
    "docx"
}


# -------------------------
# Initialize extensions
# -------------------------

db.init_app(app)

jwt = JWTManager(app)


# -------------------------
# Create required folders
# -------------------------

os.makedirs(
    app.config["UPLOAD_FOLDER"],
    exist_ok=True
)

os.makedirs(
    "generated_qr",
    exist_ok=True
)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def allowed_file(filename):

    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in ALLOWED_EXTENSIONS
    )


def get_current_user():

    user_id = get_jwt_identity()

    user = User.query.get(int(user_id))

    return user


def role_required(*allowed_roles):

    def decorator(function):

        @wraps(function)
        @jwt_required()
        def wrapper(*args, **kwargs):

            user = get_current_user()

            if not user:

                return {
                    "error": "User not found"
                }, 404

            if user.role not in allowed_roles:

                return {
                    "error": "Access denied",
                    "required_roles": allowed_roles,
                    "your_role": user.role
                }, 403

            return function(*args, **kwargs)

        return wrapper

    return decorator


def generate_application_number():

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    return f"APP-{timestamp}-{uuid.uuid4().hex[:4].upper()}"


def generate_certificate_number():

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    return f"CERT-{timestamp}-{uuid.uuid4().hex[:4].upper()}"


def get_public_base_url():
    configured = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return request.host_url.rstrip("/")


def certificate_verify_url(certificate_number):
    return f"{get_public_base_url()}/verify/{certificate_number}"


def generate_qr_code(certificate_number):
    verification_url = certificate_verify_url(certificate_number)

    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=4
    )

    qr.add_data(verification_url)
    qr.make(fit=True)

    image = qr.make_image()

    filename = f"{certificate_number}.png"

    filepath = os.path.join(
        "generated_qr",
        filename
    )

    image.save(filepath)

    return filepath


# ============================================================
# HOME / HEALTH CHECK
# ============================================================

@app.route("/")
def home():
    frontend_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend"
    )
    return send_from_directory(frontend_dir, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    frontend_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend"
    )
    return send_from_directory(frontend_dir, filename)

# ============================================================
# USER REGISTRATION
# ============================================================

@app.route("/register", methods=["POST"])
def register():

    data = request.get_json()

    if not data:

        return {
            "error": "Request body is required"
        }, 400

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")


    if not name or not email or not password or not role:

        return {
            "error": "Name, email, password and role are required"
        }, 400


    allowed_roles = {
        "OWNER",
        "LMO",
        "GATC",
        "ADMIN"
    }


    role = role.upper()


    if role not in allowed_roles:

        return {
            "error": "Invalid role",
            "allowed_roles": list(allowed_roles)
        }, 400


    existing_user = User.query.filter_by(
        email=email
    ).first()


    if existing_user:

        return {
            "error": "Email already registered"
        }, 409


    hashed_password = generate_password_hash(
        password
    )


    new_user = User(
        name=name,
        email=email,
        password_hash=hashed_password,
        role=role
    )


    db.session.add(new_user)

    db.session.commit()


    return {

        "message": "User registered successfully",

        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "role": new_user.role
        }

    }, 201


# ============================================================
# LOGIN
# ============================================================

@app.route("/login", methods=["POST"])
def login():

    data = request.get_json()

    if not data:

        return {
            "error": "Request body is required"
        }, 400


    email = data.get("email")
    password = data.get("password")


    if not email or not password:

        return {
            "error": "Email and password are required"
        }, 400


    user = User.query.filter_by(
        email=email
    ).first()


    if not user:

        return {
            "error": "Invalid email or password"
        }, 401


    if not check_password_hash(
        user.password_hash,
        password
    ):

        return {
            "error": "Invalid email or password"
        }, 401


    access_token = create_access_token(
        identity=str(user.id)
    )


    return {

        "message": "Login successful",

        "access_token": access_token,

        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }

    }, 200


# ============================================================
# PROFILE
# ============================================================

@app.route("/profile", methods=["GET"])
@jwt_required()
def profile():

    user = get_current_user()


    if not user:

        return {
            "error": "User not found"
        }, 404


    return {

        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role

    }, 200


# ============================================================
# REGISTER INSTRUMENT
# ============================================================

@app.route("/instruments", methods=["POST"])
@role_required("OWNER")
def register_instrument():

    data = request.get_json()


    if not data:

        return {
            "error": "Request body is required"
        }, 400


    required_fields = [
        "instrument_number",
        "instrument_type",
        "manufacturer",
        "model_number",
        "serial_number",
        "capacity",
        "location"
    ]


    for field in required_fields:

        if not data.get(field):

            return {
                "error": f"{field} is required"
            }, 400


    existing_instrument = Instrument.query.filter(
        or_(
            Instrument.instrument_number ==
            data["instrument_number"],

            Instrument.serial_number ==
            data["serial_number"]
        )
    ).first()


    if existing_instrument:

        return {
            "error":
                "Instrument number or serial number already exists"
        }, 409


    user = get_current_user()


    instrument = Instrument(

        instrument_number=
            data["instrument_number"],

        instrument_type=
            data["instrument_type"],

        manufacturer=
            data["manufacturer"],

        model_number=
            data["model_number"],

        serial_number=
            data["serial_number"],

        capacity=
            data["capacity"],

        location=
            data["location"],

        owner_id=
            user.id,

        status=
            "PENDING"
    )


    db.session.add(instrument)

    db.session.commit()


    return {

        "message":
            "Instrument registered successfully",

        "instrument": {

            "id":
                instrument.id,

            "instrument_number":
                instrument.instrument_number,

            "status":
                instrument.status
        }

    }, 201


# ============================================================
# GET MY INSTRUMENTS
# ============================================================

@app.route("/instruments/my", methods=["GET"])
@role_required("OWNER")
def my_instruments():

    user = get_current_user()


    instruments = Instrument.query.filter_by(
        owner_id=user.id
    ).all()


    result = []


    for instrument in instruments:

        result.append({

            "id":
                instrument.id,

            "instrument_number":
                instrument.instrument_number,

            "instrument_type":
                instrument.instrument_type,

            "manufacturer":
                instrument.manufacturer,

            "model_number":
                instrument.model_number,

            "serial_number":
                instrument.serial_number,

            "capacity":
                instrument.capacity,

            "location":
                instrument.location,

            "status":
                instrument.status,

            "verification_due_date":
                (
                    instrument.verification_due_date.isoformat()
                    if instrument.verification_due_date
                    else None
                )
        })


    return {

        "count":
            len(result),

        "instruments":
            result

    }, 200


# ============================================================
# SUBMIT VERIFICATION APPLICATION
# ============================================================

@app.route(
    "/applications",
    methods=["POST"]
)
@role_required("OWNER")
def create_application():

    data = request.get_json()


    if not data:

        return {
            "error": "Request body is required"
        }, 400


    instrument_id = data.get(
        "instrument_id"
    )

    application_type = data.get(
        "application_type"
    )


    if not instrument_id or not application_type:

        return {
            "error":
                "instrument_id and application_type are required"
        }, 400


    application_type = application_type.upper()


    allowed_types = {
        "VERIFICATION",
        "RE_VERIFICATION"
    }


    if application_type not in allowed_types:

        return {
            "error":
                "Invalid application type",
            "allowed_types":
                list(allowed_types)
        }, 400


    user = get_current_user()


    instrument = Instrument.query.filter_by(
        id=instrument_id,
        owner_id=user.id
    ).first()


    if not instrument:

        return {
            "error":
                "Instrument not found or does not belong to you"
        }, 404


    application = VerificationApplication(

        application_number=
            generate_application_number(),

        instrument_id=
            instrument.id,

        applicant_id=
            user.id,

        application_type=
            application_type,

        status=
            "SUBMITTED"
    )


    db.session.add(application)


    instrument.status = "APPLICATION_SUBMITTED"


    db.session.commit()


    return {

        "message":
            "Verification application submitted",

        "application": {

            "id":
                application.id,

            "application_number":
                application.application_number,

            "instrument_id":
                application.instrument_id,

            "application_type":
                application.application_type,

            "status":
                application.status,

            "submitted_at":
                application.submitted_at.isoformat()
        }

    }, 201


# ============================================================
# LIST APPLICATIONS
# ============================================================

@app.route(
    "/applications",
    methods=["GET"]
)
@jwt_required()
def get_applications():

    user = get_current_user()


    if user.role == "OWNER":

        applications = VerificationApplication.query.filter_by(
            applicant_id=user.id
        ).all()


    elif user.role in {
        "LMO",
        "GATC"
    }:

        applications = VerificationApplication.query.filter_by(
            assigned_to=user.id
        ).all()


    else:

        applications = VerificationApplication.query.all()


    result = []


    for application in applications:

        instrument = Instrument.query.get(application.instrument_id)
        verification = VerificationResult.query.filter_by(application_id=application.id).first()

        result.append({

            "id":
                application.id,

            "application_number":
                application.application_number,

            "instrument_id":
                application.instrument_id,

            "instrument_number":
                instrument.instrument_number if instrument else None,

            "instrument_type":
                instrument.instrument_type if instrument else None,

            "applicant_id":
                application.applicant_id,

            "application_type":
                application.application_type,

            "status":
                application.status,

            "submitted_at":
                application.submitted_at.isoformat(),

            "scheduled_date":
                (
                    application.scheduled_date.isoformat()
                    if application.scheduled_date
                    else None
                ),

            "assigned_to":
                application.assigned_to,

            "last_verified_at":
                verification.verified_at.isoformat() if verification else None
        })


    return {

        "count":
            len(result),

        "applications":
            result

    }, 200


# ============================================================
# GET SINGLE APPLICATION
# ============================================================

@app.route(
    "/applications/<int:application_id>",
    methods=["GET"]
)
@jwt_required()
def get_application(application_id):

    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error": "Application not found"
        }, 404


    current_user = get_current_user()

    if current_user.role == "OWNER" and application.applicant_id != current_user.id:
        return {"error": "Access denied"}, 403

    if current_user.role in {"LMO", "GATC"} and application.assigned_to != current_user.id:
        return {"error": "Access denied"}, 403


    instrument = Instrument.query.get(
        application.instrument_id
    )


    verification = VerificationResult.query.filter_by(
        application_id=application.id
    ).first()


    certificate = Certificate.query.filter_by(
        application_id=application.id
    ).first()


    return {

        "application": {

            "id":
                application.id,

            "application_number":
                application.application_number,

            "application_type":
                application.application_type,

            "status":
                application.status,

            "submitted_at":
                application.submitted_at.isoformat(),

            "scheduled_date":
                (
                    application.scheduled_date.isoformat()
                    if application.scheduled_date
                    else None
                ),

            "assigned_to":
                application.assigned_to
        },


        "instrument": {

            "id":
                instrument.id
                if instrument else None,

            "instrument_number":
                instrument.instrument_number
                if instrument else None,

            "instrument_type":
                instrument.instrument_type
                if instrument else None,

            "manufacturer":
                instrument.manufacturer
                if instrument else None,

            "model_number":
                instrument.model_number
                if instrument else None,

            "serial_number":
                instrument.serial_number
                if instrument else None,

            "capacity":
                instrument.capacity
                if instrument else None,

            "location":
                instrument.location
                if instrument else None,

            "status":
                instrument.status
                if instrument else None
        },


        "verification": {

            "result":
                verification.result
                if verification else None,

            "observations":
                verification.observations
                if verification else None,

            "verified_at":
                (
                    verification.verified_at.isoformat()
                    if verification
                    else None
                )
        },


        "certificate": {

            "certificate_number":
                certificate.certificate_number
                if certificate else None,

            "issue_date":
                (
                    certificate.issue_date.isoformat()
                    if certificate
                    else None
                ),

            "valid_until":
                (
                    certificate.valid_until.isoformat()
                    if certificate
                    else None
                ),

            "status":
                certificate.status
                if certificate else None,

            "verify_url":
                certificate_verify_url(certificate.certificate_number)
                if certificate else None,

            "qr_url":
                f"{request.host_url.rstrip('/')}/generated_qr/{certificate.certificate_number}.png"
                if certificate else None
        }

    }, 200


# ============================================================
# ASSIGN APPLICATION TO LMO / GATC
# ============================================================

@app.route(
    "/applications/<int:application_id>/assign",
    methods=["PUT"]
)
@role_required(
    "ADMIN"
)
def assign_application(application_id):

    data = request.get_json()


    if not data:

        return {
            "error":
                "Request body is required"
        }, 400


    assigned_to = data.get(
        "assigned_to"
    )


    if not assigned_to:

        return {
            "error":
                "assigned_to is required"
        }, 400


    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error":
                "Application not found"
        }, 404


    officer = User.query.get(
        int(assigned_to)
    )


    if not officer:

        return {
            "error":
                "Assigned user not found"
        }, 404


    if officer.role not in {
        "LMO",
        "GATC"
    }:

        return {
            "error":
                "Application can only be assigned to an LMO or GATC"
        }, 400


    application.assigned_to = officer.id

    application.status = "ASSIGNED"


    db.session.commit()


    return {

        "message":
            "Application assigned successfully",

        "application": {

            "application_number":
                application.application_number,

            "assigned_to":
                officer.id,

            "assigned_role":
                officer.role,

            "status":
                application.status
        }

    }, 200


# ============================================================
# SCHEDULE VERIFICATION
# ============================================================

@app.route(
    "/applications/<int:application_id>/schedule",
    methods=["PUT"]
)
@role_required(
    "ADMIN"
)
def schedule_application(application_id):

    data = request.get_json()


    if not data:

        return {
            "error":
                "Request body is required"
        }, 400


    scheduled_date = data.get(
        "scheduled_date"
    )


    if not scheduled_date:

        return {
            "error":
                "scheduled_date is required"
        }, 400


    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error":
                "Application not found"
        }, 404


    try:

        parsed_date = datetime.strptime(
            scheduled_date,
            "%Y-%m-%d"
        ).date()

    except ValueError:

        return {
            "error":
                "Date must use YYYY-MM-DD format"
        }, 400


    application.scheduled_date = parsed_date

    application.status = "SCHEDULED"


    db.session.commit()


    return {

        "message":
            "Verification scheduled successfully",

        "application_number":
            application.application_number,

        "scheduled_date":
            parsed_date.isoformat(),

        "status":
            application.status

    }, 200


# ============================================================
# PERFORM VERIFICATION
# ============================================================

@app.route(
    "/applications/<int:application_id>/verify",
    methods=["POST"]
)
@role_required(
    "LMO",
    "GATC"
)
def perform_verification(application_id):

    data = request.get_json()


    if not data:

        return {
            "error":
                "Request body is required"
        }, 400


    result = data.get(
        "result"
    )

    observations = data.get(
        "observations",
        ""
    )


    if not result:

        return {
            "error":
                "Verification result is required"
        }, 400


    result = result.upper()


    allowed_results = {
        "VERIFIED",
        "REJECTED"
    }


    if result not in allowed_results:

        return {
            "error":
                "Result must be VERIFIED or REJECTED"
        }, 400


    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error":
                "Application not found"
        }, 404


    current_user = get_current_user()


    if application.assigned_to != current_user.id:

        return {
            "error":
                "This application is not assigned to you"
        }, 403


    existing_result = VerificationResult.query.filter_by(
        application_id=application.id
    ).first()


    if existing_result:

        return {
            "error":
                "Verification has already been recorded"
        }, 409


    verification = VerificationResult(

        application_id=
            application.id,

        officer_id=
            current_user.id,

        result=
            result,

        observations=
            observations
    )


    db.session.add(
        verification
    )


    instrument = Instrument.query.get(
        application.instrument_id
    )


    if result == "VERIFIED":

        application.status = "VERIFIED"

        instrument.status = "VERIFIED"


        # Default validity period for prototype.
        # This can later be configured according
        # to the applicable instrument category/rules.

        validity_date = (
            date.today()
            + timedelta(days=365)
        )

        instrument.verification_due_date = (
            validity_date
        )

    else:

        application.status = "REJECTED"

        instrument.status = "REJECTED"


    db.session.commit()


    return {

        "message":
            "Verification result recorded",

        "application_number":
            application.application_number,

        "result":
            result,

        "observations":
            observations,

        "status":
            application.status

    }, 200


# ============================================================
# GENERATE DIGITAL CERTIFICATE
# ============================================================

@app.route(
    "/applications/<int:application_id>/certificate",
    methods=["POST"]
)
@role_required(
    "LMO",
    "GATC"
)
def generate_certificate(application_id):

    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error":
                "Application not found"
        }, 404


    if application.status != "VERIFIED":

        return {
            "error":
                "Certificate can only be generated for verified applications"
        }, 400


    current_user = get_current_user()

    if application.assigned_to != current_user.id:
        return {"error": "This application is not assigned to you"}, 403


    existing_certificate = Certificate.query.filter_by(
        application_id=application.id
    ).first()


    if existing_certificate:

        return {

            "message":
                "Certificate already exists",

            "certificate": {

                "certificate_number":
                    existing_certificate.certificate_number,

                "issue_date":
                    existing_certificate.issue_date.isoformat(),

                "valid_until":
                    existing_certificate.valid_until.isoformat(),

                "status":
                    existing_certificate.status,

                "qr_url":
                    f"{request.host_url.rstrip('/')}/generated_qr/{existing_certificate.certificate_number}.png",

                "verify_url":
                    certificate_verify_url(existing_certificate.certificate_number)
            }

        }, 200


    instrument = Instrument.query.get(
        application.instrument_id
    )


    applicant = User.query.get(
        application.applicant_id
    )


    if not instrument or not applicant:

        return {
            "error":
                "Instrument or applicant record not found"
        }, 404


    issue_date = date.today()


    valid_until = (
        issue_date
        + timedelta(days=365)
    )


    certificate_number = (
        generate_certificate_number()
    )


    certificate = Certificate(

        certificate_number=
            certificate_number,

        application_id=
            application.id,

        instrument_id=
            instrument.id,

        issued_to=
            applicant.id,

        issue_date=
            issue_date,

        valid_until=
            valid_until,

        status=
            "ACTIVE"
    )


    db.session.add(
        certificate
    )


    instrument.verification_due_date = (
        valid_until
    )


    db.session.commit()


    qr_path = generate_qr_code(
        certificate_number
    )


    return {

        "message":
            "Digital certificate generated successfully",

        "certificate": {

            "certificate_number":
                certificate.certificate_number,

            "application_number":
                application.application_number,

            "instrument_number":
                instrument.instrument_number,

            "issued_to":
                applicant.name,

            "issue_date":
                issue_date.isoformat(),

            "valid_until":
                valid_until.isoformat(),

            "status":
                certificate.status,

            "qr_code":
                qr_path,

            "qr_url":
                f"{request.host_url.rstrip('/')}/generated_qr/{certificate_number}.png",

            "verify_url":
                certificate_verify_url(certificate_number)
        }

    }, 201


# ============================================================
# PUBLIC CERTIFICATE VERIFICATION
# ============================================================

@app.route(
    "/verify/<certificate_number>",
    methods=["GET"]
)
def verify_certificate(certificate_number):

    certificate = Certificate.query.filter_by(
        certificate_number=certificate_number
    ).first()


    if not certificate:

        return {

            "valid":
                False,

            "message":
                "Certificate not found"
        }, 404


    today = date.today()


    if certificate.valid_until < today:

        certificate.status = "EXPIRED"

        db.session.commit()


        return {

            "valid":
                False,

            "message":
                "Certificate has expired",

            "certificate_number":
                certificate.certificate_number,

            "valid_until":
                certificate.valid_until.isoformat(),

            "status":
                "EXPIRED"

        }, 200


    if certificate.status != "ACTIVE":

        return {

            "valid":
                False,

            "message":
                "Certificate is not active",

            "certificate_number":
                certificate.certificate_number,

            "status":
                certificate.status

        }, 200


    instrument = Instrument.query.get(
        certificate.instrument_id
    )


    return {

        "valid":
            True,

        "message":
            "Certificate is valid",

        "certificate": {

            "certificate_number":
                certificate.certificate_number,

            "instrument_number":
                instrument.instrument_number
                if instrument
                else None,

            "issue_date":
                certificate.issue_date.isoformat(),

            "valid_until":
                certificate.valid_until.isoformat(),

            "status":
                certificate.status
        }

    }, 200


# ============================================================
# INSTRUMENT VERIFICATION HISTORY
# ============================================================

@app.route(
    "/instruments/<int:instrument_id>/history",
    methods=["GET"]
)
@jwt_required()
def instrument_history(instrument_id):

    instrument = Instrument.query.get(
        instrument_id
    )


    if not instrument:

        return {
            "error":
                "Instrument not found"
        }, 404


    current_user = get_current_user()

    if current_user.role == "OWNER" and instrument.owner_id != current_user.id:
        return {"error": "Access denied"}, 403

    if current_user.role in {"LMO", "GATC"}:
        assigned_application = VerificationApplication.query.filter_by(
            instrument_id=instrument.id,
            assigned_to=current_user.id
        ).first()
        if not assigned_application:
            return {"error": "Access denied"}, 403


    applications = VerificationApplication.query.filter_by(
        instrument_id=instrument.id
    ).order_by(
        VerificationApplication.submitted_at.desc()
    ).all()


    history = []


    for application in applications:

        verification = VerificationResult.query.filter_by(
            application_id=application.id
        ).first()


        certificate = Certificate.query.filter_by(
            application_id=application.id
        ).first()


        history.append({

            "application_number":
                application.application_number,

            "application_type":
                application.application_type,

            "status":
                application.status,

            "submitted_at":
                application.submitted_at.isoformat(),

            "verification_result":
                verification.result
                if verification
                else None,

            "observations":
                verification.observations
                if verification
                else None,

            "certificate_number":
                certificate.certificate_number
                if certificate
                else None,

            "valid_until":
                certificate.valid_until.isoformat()
                if certificate
                else None
        })


    return {

        "instrument_id":
            instrument.id,

        "instrument_number":
            instrument.instrument_number,

        "verification_history":
            history

    }, 200


# ============================================================
# SEARCH INSTRUMENTS
# ============================================================

@app.route(
    "/search/instruments",
    methods=["GET"]
)
@jwt_required()
def search_instruments():

    query = request.args.get(
        "q",
        ""
    ).strip()


    if not query:

        return {
            "error":
                "Search query is required"
        }, 400


    instruments = Instrument.query.filter(

        or_(

            Instrument.instrument_number.ilike(
                f"%{query}%"
            ),

            Instrument.serial_number.ilike(
                f"%{query}%"
            ),

            Instrument.manufacturer.ilike(
                f"%{query}%"
            ),

            Instrument.model_number.ilike(
                f"%{query}%"
            ),

            Instrument.instrument_type.ilike(
                f"%{query}%"
            )
        )

    ).all()


    results = []


    for instrument in instruments:

        results.append({

            "id":
                instrument.id,

            "instrument_number":
                instrument.instrument_number,

            "instrument_type":
                instrument.instrument_type,

            "manufacturer":
                instrument.manufacturer,

            "model_number":
                instrument.model_number,

            "serial_number":
                instrument.serial_number,

            "status":
                instrument.status,

            "verification_due_date":
                (
                    instrument.verification_due_date.isoformat()
                    if instrument.verification_due_date
                    else None
                )
        })


    return {

        "query":
            query,

        "count":
            len(results),

        "results":
            results

    }, 200


# ============================================================
# EXPIRING CERTIFICATES
# ============================================================

@app.route(
    "/alerts/expiring",
    methods=["GET"]
)
@jwt_required()
def expiring_certificates():

    today = date.today()

    thirty_days_later = (
        today + timedelta(days=30)
    )


    certificates = Certificate.query.filter(

        Certificate.valid_until >= today,

        Certificate.valid_until <=
        thirty_days_later,

        Certificate.status == "ACTIVE"

    ).all()


    alerts = []


    for certificate in certificates:

        days_remaining = (
            certificate.valid_until - today
        ).days


        alerts.append({

            "certificate_number":
                certificate.certificate_number,

            "valid_until":
                certificate.valid_until.isoformat(),

            "days_remaining":
                days_remaining,

            "alert":
                "Verification renewal due soon"
        })


    return {

        "count":
            len(alerts),

        "certificates":
            alerts

    }, 200


# ============================================================
# DASHBOARD
# ============================================================

@app.route(
    "/dashboard",
    methods=["GET"]
)
@jwt_required()
def dashboard():

    total_users = User.query.count()

    total_instruments = Instrument.query.count()

    total_applications = (
        VerificationApplication.query.count()
    )

    pending_applications = (
        VerificationApplication.query.filter_by(
            status="SUBMITTED"
        ).count()
    )

    assigned_applications = (
        VerificationApplication.query.filter_by(
            status="ASSIGNED"
        ).count()
    )

    scheduled_applications = (
        VerificationApplication.query.filter_by(
            status="SCHEDULED"
        ).count()
    )

    verified_applications = (
        VerificationApplication.query.filter_by(
            status="VERIFIED"
        ).count()
    )

    rejected_applications = (
        VerificationApplication.query.filter_by(
            status="REJECTED"
        ).count()
    )

    total_certificates = (
        Certificate.query.count()
    )

    active_certificates = (
        Certificate.query.filter_by(
            status="ACTIVE"
        ).count()
    )

    expired_certificates = (
        Certificate.query.filter_by(
            status="EXPIRED"
        ).count()
    )


    today = date.today()

    thirty_days_later = (
        today + timedelta(days=30)
    )


    expiring_soon = Certificate.query.filter(

        Certificate.valid_until >= today,

        Certificate.valid_until <=
        thirty_days_later,

        Certificate.status == "ACTIVE"

    ).count()


    return {

        "users":
            total_users,

        "instruments":
            total_instruments,

        "applications": {

            "total":
                total_applications,

            "pending":
                pending_applications,

            "assigned":
                assigned_applications,

            "scheduled":
                scheduled_applications,

            "verified":
                verified_applications,

            "rejected":
                rejected_applications
        },

        "certificates": {

            "total":
                total_certificates,

            "active":
                active_certificates,

            "expired":
                expired_certificates,

            "expiring_soon":
                expiring_soon
        }

    }, 200


# ============================================================
# FILE / DOCUMENT UPLOAD
# ============================================================

@app.route(
    "/applications/<int:application_id>/upload",
    methods=["POST"]
)
@jwt_required()
def upload_document(application_id):

    application = VerificationApplication.query.get(
        application_id
    )


    if not application:

        return {
            "error":
                "Application not found"
        }, 404


    current_user = get_current_user()

    if current_user.role == "OWNER" and application.applicant_id != current_user.id:
        return {"error": "Access denied"}, 403

    if current_user.role in {"LMO", "GATC"} and application.assigned_to != current_user.id:
        return {"error": "Access denied"}, 403

    if "file" not in request.files:

        return {
            "error":
                "No file provided"
        }, 400


    file = request.files["file"]


    if file.filename == "":

        return {
            "error":
                "No file selected"
        }, 400


    if not allowed_file(file.filename):

        return {

            "error":
                "File type not allowed",

            "allowed_types":
                list(ALLOWED_EXTENSIONS)

        }, 400


    filename = secure_filename(
        file.filename
    )


    unique_filename = (
        f"{uuid.uuid4().hex}_"
        f"{filename}"
    )


    filepath = os.path.join(

        app.config["UPLOAD_FOLDER"],

        unique_filename
    )


    file.save(filepath)


    return {

        "message":
            "File uploaded successfully",

        "application_id":
            application_id,

        "filename":
            unique_filename,

        "path":
            filepath

    }, 201


# ============================================================
# LIST LMOs AND GATCs
# ============================================================

@app.route(
    "/verification-officers",
    methods=["GET"]
)
@role_required(
    "ADMIN"
)
def verification_officers():

    users = User.query.filter(
        User.role.in_([
            "LMO",
            "GATC"
        ])
    ).all()


    officers = []


    for user in users:

        officers.append({

            "id":
                user.id,

            "name":
                user.name,

            "email":
                user.email,

            "role":
                user.role
        })


    return {

        "count":
            len(officers),

        "officers":
            officers

    }, 200



# ============================================================
# CERTIFICATE LIST
# ============================================================

@app.route("/certificates", methods=["GET"])
@jwt_required()
def list_certificates():
    user = get_current_user()
    query = Certificate.query

    if user.role == "OWNER":
        query = query.filter_by(issued_to=user.id)

    certificates = query.order_by(Certificate.issue_date.desc()).all()
    result = []

    for certificate in certificates:
        instrument = Instrument.query.get(certificate.instrument_id)
        result.append({
            "id": certificate.id,
            "certificate_number": certificate.certificate_number,
            "application_id": certificate.application_id,
            "instrument_number": instrument.instrument_number if instrument else None,
            "issue_date": certificate.issue_date.isoformat(),
            "valid_until": certificate.valid_until.isoformat(),
            "status": certificate.status,
            "verify_url": certificate_verify_url(certificate.certificate_number)
        })

    return {"count": len(result), "certificates": result}, 200


# ============================================================
# APPLICATION REPORT (CSV)
# ============================================================

@app.route("/reports/applications", methods=["GET"])
@jwt_required()
def applications_report():
    user = get_current_user()

    if user.role == "OWNER":
        applications = VerificationApplication.query.filter_by(applicant_id=user.id).all()
    elif user.role in {"LMO", "GATC"}:
        applications = VerificationApplication.query.filter_by(assigned_to=user.id).all()
    else:
        applications = VerificationApplication.query.all()

    output = [
        "Application Number,Instrument ID,Application Type,Status,Submitted At,Scheduled Date,Assigned To"
    ]

    for a in applications:
        row = [
            a.application_number,
            a.instrument_id,
            a.application_type,
            a.status,
            a.submitted_at.isoformat() if a.submitted_at else "",
            a.scheduled_date.isoformat() if a.scheduled_date else "",
            a.assigned_to or ""
        ]
        escaped = []
        for value in row:
            text = str(value).replace('"', '""')
            escaped.append(f'"{text}"')
        output.append(",".join(escaped))

    from flask import Response
    return Response(
        "\n".join(output),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=applications_report.csv"}
    )


# ============================================================
# SERVE GENERATED QR IMAGES
# ============================================================

@app.route("/generated_qr/<path:filename>", methods=["GET"])
def generated_qr(filename):
    from flask import send_from_directory
    return send_from_directory("generated_qr", filename)


# ============================================================
# CREATE DATABASE TABLES
# ============================================================

with app.app_context():

    db.create_all()


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        host="0.0.0.0",
        port=5000
    )