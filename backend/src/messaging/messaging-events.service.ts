import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface MessagingStreamEvent {
  type: 'message.created' | 'message.updated' | 'message.deleted' | 'typing';
  conversationId: string;
  message?: Record<string, unknown>;
  messageId?: string;
  typing?: boolean;
  name?: string;
}

@Injectable()
export class MessagingEventsService {
  private readonly employeeSubjects = new Map<string, Subject<MessagingStreamEvent>>();
  private readonly adminSubject = new Subject<MessagingStreamEvent>();

  private readonly subscriptionCounts = new Map<string, number>();

  /** Stream events for an employee (their own conversation) or the shared admin channel. */
  stream(userId: string, isAdmin: boolean): Observable<MessagingStreamEvent> {
    if (isAdmin) return this.adminSubject.asObservable();
    const subject = this.subjectFor(userId);
    return new Observable<MessagingStreamEvent>((subscriber) => {
      this.subscriptionCounts.set(userId, (this.subscriptionCounts.get(userId) ?? 0) + 1);
      const subscription = subject.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        const next = (this.subscriptionCounts.get(userId) ?? 1) - 1;
        if (next <= 0) {
          this.subscriptionCounts.delete(userId);
          this.employeeSubjects.delete(userId);
        } else {
          this.subscriptionCounts.set(userId, next);
        }
      };
    });
  }

  emitToEmployee(userId: string, event: MessagingStreamEvent) {
    this.employeeSubjects.get(userId)?.next(event);
  }

  emitToAdmins(event: MessagingStreamEvent) {
    this.adminSubject.next(event);
  }

  /** Deliver an event to both sides of a conversation (employee + all admins). */
  emitToConversation(employeeId: string, event: MessagingStreamEvent) {
    this.emitToEmployee(employeeId, event);
    this.emitToAdmins(event);
  }

  private subjectFor(userId: string): Subject<MessagingStreamEvent> {
    let subject = this.employeeSubjects.get(userId);
    if (!subject) {
      subject = new Subject<MessagingStreamEvent>();
      this.employeeSubjects.set(userId, subject);
    }
    return subject;
  }
}