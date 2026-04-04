'use client';

import ContentCalendarPage from '@pages/calendar/content/content-calendar-page';
import Container from '@ui/layout/container/Container';
import { HiOutlineCalendarDays } from 'react-icons/hi2';

export default function CalendarPageContent() {
  return (
    <Container
      label="Calendar"
      description="Schedule and manage your content publishing calendar"
      icon={HiOutlineCalendarDays}
    >
      <ContentCalendarPage />
    </Container>
  );
}
