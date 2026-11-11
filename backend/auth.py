import jwt
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

SECRET_KEY = 'dev-secret-key-change-in-prod'
ALGORITHM = 'HS256'
TOKEN_EXPIRE_HOURS = 24

def hash_password(password: str) -> str:
    return generate_password_hash(password)

def verify_password(password: str, hash: str) -> bool:
    return check_password_hash(hash, password)

def create_access_token(user_id: str) -> str:
    expires = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {'sub': user_id, 'exp': expires}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get('sub')
    except jwt.InvalidTokenError:
        return None
