from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter instance — imported by main.py and individual routers.
# Keyed by remote IP so limits are per-client, not global.
limiter = Limiter(key_func=get_remote_address)
