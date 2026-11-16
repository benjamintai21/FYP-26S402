import jwt
import os
import uuid
from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash, check_password_hash

SECRET_KEY = os.getenv('JWT_SECRET_KEY')
if not SECRET_KEY or len(SECRET_KEY.encode('utf-8')) < 32:
    raise RuntimeError('Set JWT_SECRET_KEY to a secret of at least 32 bytes')
ALGORITHM = 'HS256'
TOKEN_EXPIRE_HOURS = 24

def hash_password(password: str) -> str:
    return generate_password_hash(password)

def verify_password(password: str, hash: str) -> bool:
    return check_password_hash(hash, password)

def create_access_token(user_id: str, session_version: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {'sub': user_id, 'exp': expires, 'jti': str(uuid.uuid4()), 'ver': session_version}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={'require': ['sub', 'exp', 'jti', 'ver']})
        if not isinstance(payload.get('sub'), str) or not isinstance(payload.get('jti'), str) or not isinstance(payload.get('ver'), int):
            return None
        return payload
    except jwt.InvalidTokenError:
        return None
