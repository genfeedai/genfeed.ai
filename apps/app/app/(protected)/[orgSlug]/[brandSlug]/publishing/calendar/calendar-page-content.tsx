'use client';

import Container from '@ui/layout/container/Container';
import { Calendar } from 'lucide-react';

import ContentCalendarPage from './content-calendar-page';

export default function CalendarPageContent() {
  return (
    <Container
      label="Calendar"
      description="Schedule and manage your content publishing calendar"
      icon={Calendar}
    >
      <ContentCalendarPage />
    </Container>
  );
}
