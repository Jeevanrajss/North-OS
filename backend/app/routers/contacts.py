"""Contacts router — people you split expenses with."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.contact import Contact
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/contacts", tags=["contacts"])


class ContactIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    phone: str | None = None
    upi_id: str | None = None
    notes: str | None = None


class ContactOut(BaseModel):
    id: str
    name: str
    phone: str | None
    upi_id: str | None
    notes: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ContactOut])
def list_contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Contact)
        .filter(Contact.user_id == current_user.id)
        .order_by(Contact.name)
        .all()
    )


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(payload: ContactIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contact = Contact(**payload.model_dump(), user_id=current_user.id)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contact = db.query(Contact).filter(Contact.id == contact_id, Contact.user_id == current_user.id).first()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
