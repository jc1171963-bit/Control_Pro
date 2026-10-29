from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column


def ahora() -> datetime:
    return datetime.now(timezone.utc)


Dinero = Numeric(12, 2)
CERO = Decimal("0.00")


class ConFechas:
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actualizado: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
