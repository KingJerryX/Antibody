"""Antibody shield features.

Mirrors packages/shield/src/engine.ts: same feature names, windows and thresholds.

Two layers:
  * Session / Ip / Endpoint hold windowed aggregations over Request events. They fill in once
    request events stream into Chalk (see chalk/README.md, "Streaming request events").
  * Request.session_distinct_users_5m etc. are the same windows computed at the edge by the
    shield and passed as query inputs, so request.risk_score works on day one without a stream.
"""

from datetime import datetime

from chalk import online
from chalk.features import DataFrame, Features, _, features
from chalk.streams import Windowed, windowed

# Value at which one signal alone scores 1.0. Keep in sync with LIMITS in engine.ts.
EXTRA_USERS_READ = 5
ROUTE_RPM = 30
FAILED_LOGINS = 5
LOGIN_ATTEMPTS = 10
AI_CALLS_PER_MIN = 10
BLOCK_AT = 0.9
CHALLENGE_AT = 0.7


@features
class Session:
    id: str
    requests: "DataFrame[Request]"
    distinct_users_read: Windowed[int] = windowed(
        "5m",
        expression=_.requests[_.user_id_read, _.at > _.chalk_window, _.at < _.chalk_now].approx_count_distinct(),
        default=0,
    )
    ai_calls: Windowed[int] = windowed(
        "1m",
        expression=_.requests[_.is_ai_call == True, _.at > _.chalk_window, _.at < _.chalk_now].count(),  # noqa: E712
        default=0,
    )


@features
class Ip:
    id: str
    requests: "DataFrame[Request]"
    request_count: Windowed[int] = windowed(
        "1m",
        "10m",
        expression=_.requests[_.at > _.chalk_window, _.at < _.chalk_now].count(),
        default=0,
    )
    failed_logins: Windowed[int] = windowed(
        "10m",
        expression=_.requests[_.is_failed_login == True, _.at > _.chalk_window, _.at < _.chalk_now].count(),  # noqa: E712
        default=0,
    )


@features
class Endpoint:
    # Normalized route, e.g. "/api/users/:id".
    id: str
    requests: "DataFrame[Request]"
    request_count: Windowed[int] = windowed(
        "1m",
        "1h",
        expression=_.requests[_.at > _.chalk_window, _.at < _.chalk_now].count(),
        default=0,
    )


@features
class Request:
    id: str
    at: datetime
    method: str
    path: str
    status: int | None
    user_id_read: str | None
    is_ai_call: bool
    is_failed_login: bool

    session_id: Session.id
    session: Session
    ip_id: Ip.id
    ip: Ip
    endpoint_id: Endpoint.id
    endpoint: Endpoint

    # Edge-computed windows (inputs from the shield; same definitions as above).
    session_distinct_users_5m: int
    session_user_read_span_s: int
    ip_route_rpm: int
    ip_failed_logins_10m: int
    ip_login_attempts_10m: int
    session_ai_calls_1m: int

    # Outputs the shield reads.
    risk_score: float
    decision: str
    reasons: list[str]


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def score(distinct_users: int, span_s: int, route_rpm: int, failed_logins: int, login_attempts: int, ai_calls: int):
    """Pure scoring, same math as score() in engine.ts. Returns (risk_score, decision, reasons)."""
    signals = [
        (
            _clamp((distinct_users - 1) / EXTRA_USERS_READ),
            f"this session read {distinct_users} different users' profiles in {span_s}s; normal is 1",
        ),
        (
            _clamp(route_rpm / ROUTE_RPM),
            f"this IP sent {route_rpm} requests to this route in the last minute; normal is under 20",
        ),
        (
            _clamp(max(failed_logins / FAILED_LOGINS, login_attempts / LOGIN_ATTEMPTS)),
            f"this IP had {failed_logins} failed logins ({login_attempts} attempts) in 10 min; normal is 0-1",
        ),
        (
            _clamp(ai_calls / AI_CALLS_PER_MIN),
            f"this session made {ai_calls} AI chat calls in the last minute; normal is 2-3",
        ),
    ]
    strong = sorted((s for s in signals if s[0] >= 0.5), key=lambda s: -s[0])
    top = max(s for s, _r in signals)
    risk = round(_clamp(top + 0.1 * max(0, len(strong) - 1)), 2)
    decision = "block" if risk >= BLOCK_AT else "challenge" if risk >= CHALLENGE_AT else "allow"
    return risk, decision, [r for _s, r in strong]


@online
def score_request(
    distinct_users: Request.session_distinct_users_5m,
    span_s: Request.session_user_read_span_s,
    route_rpm: Request.ip_route_rpm,
    failed_logins: Request.ip_failed_logins_10m,
    login_attempts: Request.ip_login_attempts_10m,
    ai_calls: Request.session_ai_calls_1m,
) -> Features[Request.risk_score, Request.decision, Request.reasons]:
    risk, decision, reasons = score(distinct_users, span_s, route_rpm, failed_logins, login_attempts, ai_calls)
    return Request(risk_score=risk, decision=decision, reasons=reasons)
