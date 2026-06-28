"""
SSRF protection — validates any user-supplied URL before the server makes an outbound request.

Blocks:
- Non-https schemes in production (http allowed only for Ollama local dev)
- Private/loopback IP ranges (RFC 1918, 169.254.x.x, ::1)
- Cloud metadata endpoints (AWS, GCP, Azure, DigitalOcean)
- DNS rebinding: resolves hostname to IP and checks again
"""
import ipaddress
import socket
from urllib.parse import urlparse
from fastapi import HTTPException

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # link-local / cloud metadata
    ipaddress.ip_network("100.64.0.0/10"),    # carrier-grade NAT
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_METADATA_HOSTS = {
    "metadata.google.internal",
    "metadata.goog",
    "169.254.169.254",               # AWS, GCP, Azure, DO metadata
    "fd00:ec2::254",                 # AWS IPv6 metadata
    "instance-data",                 # some cloud providers
}


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        return True  # unparseable → block


def validate_url(url: str, *, allow_http_localhost: bool = False) -> str:
    """
    Raise HTTPException 400 if url is SSRF-risky.
    Returns the url unchanged if safe.

    allow_http_localhost=True is used for Ollama (local dev only).
    """
    if not url:
        return url

    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL format.")

    scheme = parsed.scheme.lower()
    hostname = parsed.hostname or ""

    # Scheme check
    if scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"URL scheme '{scheme}' not allowed. Use https.")

    if scheme == "http":
        # Allow http only for explicit localhost Ollama in dev
        if not allow_http_localhost or hostname not in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            raise HTTPException(status_code=400, detail="Plain http is not allowed. Use https.")

    # Block known metadata hostnames
    if hostname.lower() in _METADATA_HOSTS:
        raise HTTPException(status_code=400, detail="URL resolves to a restricted internal endpoint.")

    # When allow_http_localhost is True, allow loopback without further DNS check
    if allow_http_localhost and hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return url

    # Resolve hostname → IP and re-check (prevents DNS rebinding attacks)
    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if scheme == "https" else 80),
                                   proto=socket.IPPROTO_TCP)
        for _, _, _, _, sockaddr in infos:
            ip = sockaddr[0]
            if _is_private_ip(ip):
                raise HTTPException(
                    status_code=400,
                    detail="URL resolves to a private/internal IP address. For security reasons, "
                           "Ittiqan does not make requests to internal network addresses."
                )
    except HTTPException:
        raise
    except OSError:
        # DNS resolution failed — block rather than allow unknown hosts
        raise HTTPException(status_code=400, detail=f"Could not resolve hostname '{hostname}'.")

    return url
