class DomainError(Exception):
    """Business rule violation. The message is safe to show to the user."""


class NotFound(DomainError):
    pass


class InvalidTransition(DomainError):
    pass
