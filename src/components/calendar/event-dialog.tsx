"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteEvent,
  saveEvent,
  type ActionState,
} from "@/app/(app)/calendar/actions";
import { formatLocalDate, instantToLocal, type LocalDate } from "@/lib/time";
import type { CalendarEvent, Child, EventType } from "@/lib/types";

const TYPES: { value: EventType; label: string }[] = [
  { value: "handover", label: "Handover" },
  { value: "appointment", label: "Appointment" },
  { value: "activity", label: "Activity" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
];

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : isEdit ? "Save changes" : "Add event"}
    </Button>
  );
}

export function EventDialog({
  open,
  onClose,
  date,
  event,
  timeZone,
  familyChildren,
  eventChildren,
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate | null;
  event: CalendarEvent | null;
  timeZone: string;
  familyChildren: Child[];
  eventChildren: Child[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveEvent,
    {},
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteEvent,
    {},
  );

  // Seeded once per mount. The parent gives this component a key derived from
  // the event being edited, so opening a different event remounts it with the
  // right initial values rather than resetting state from an effect.
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [type, setType] = useState<EventType>(event?.type ?? "other");

  // Close once the server confirms; leaving it open would show stale values.
  useEffect(() => {
    if (state.ok || deleteState.ok) onClose();
  }, [state.ok, deleteState.ok, onClose]);

  if (!open) return null;

  const isEdit = event !== null;
  const start = event ? instantToLocal(new Date(event.starts_at), timeZone) : null;
  const end = event ? instantToLocal(new Date(event.ends_at), timeZone) : null;

  const defaultDate = event
    ? formatLocalDate({ year: start!.year, month: start!.month, day: start!.day })
    : date
      ? formatLocalDate(date)
      : "";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {isEdit ? <input type="hidden" name="id" value={event.id} /> : null}
          <input type="hidden" name="type" value={type} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">What is it?</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={event?.title ?? ""}
              placeholder="Dentist, football practice, handover…"
              autoFocus
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Type</legend>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  aria-pressed={type === option.value}
                  className={
                    type === option.value
                      ? "rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-full bg-secondary px-3.5 py-2 text-sm text-secondary-foreground hover:bg-accent"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={defaultDate}
            />
          </div>

          <label className="flex items-center gap-2.5">
            <Checkbox
              name="allDay"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <span className="text-sm">All day</span>
          </label>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startTime">Starts</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  required
                  defaultValue={
                    start ? formatClock(start.hour, start.minute) : "09:00"
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endTime">Ends</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={end ? formatClock(end.hour, end.minute) : ""}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for a moment in time.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Where (optional)</Label>
            <Input
              id="location"
              name="location"
              maxLength={200}
              defaultValue={event?.location ?? ""}
              placeholder="The usual car park"
            />
          </div>

          {familyChildren.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Who is it for?</legend>
              <div className="flex flex-col gap-2">
                {familyChildren.map((child) => (
                  <label key={child.id} className="flex items-center gap-2.5">
                    <Checkbox
                      name="childId"
                      value={child.id}
                      defaultChecked={eventChildren.some((c) => c.id === child.id)}
                    />
                    <span className="text-sm">{child.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={2000}
              defaultValue={event?.notes ?? ""}
              placeholder="Bring the boots"
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SaveButton isEdit={isEdit} />
          </DialogFooter>
        </form>

        {isEdit ? (
          <form action={deleteAction} className="border-t border-border pt-4">
            <input type="hidden" name="id" value={event.id} />
            <Button
              type="submit"
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
              Delete this event
            </Button>
            {deleteState.error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {deleteState.error}
              </p>
            ) : null}
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function formatClock(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
