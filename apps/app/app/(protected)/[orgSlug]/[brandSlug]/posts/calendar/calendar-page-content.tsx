'use client';

import Container from '@ui/layout/container/Container';
import { HiOutlineCalendarDays } from 'react-icons/hi2';
import ContentCalendarPage from './content-calendar-page';

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
