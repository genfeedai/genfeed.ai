import type { Meta, StoryObj } from '@storybook/nextjs';
import FormDatepicker from '@ui/forms/pickers/datepicker/form-datepicker/FormDatepicker';
import { useState } from 'react';

/**
 * FormDatepicker component using shadcn Calendar + Popover.
 * Supports date selection with month/year dropdowns and min/max constraints.
 */
const meta = {
  argTypes: {
    dateFormat: {
      control: 'text',
      description: 'Date format string (e.g., yyyy-MM-dd, MM/dd/yyyy)',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disables datepicker',
    },
    isRequired: {
      control: 'boolean',
      description: 'Marks as required',
    },
    label: {
      control: 'text',
      description: 'Label text',
    },
    placeholderText: {
      control: 'text',
      description: 'Placeholder text',
    },
    showMonthDropdown: {
      control: 'boolean',
      description: 'Shows month dropdown',
    },
    showYearDropdown: {
      control: 'boolean',
      description: 'Shows year dropdown',
    },
  },
  component: FormDatepicker,
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A datepicker component built on shadcn Calendar + Popover with customizable date formats and constraints.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormDatepicker',
} satisfies Meta<typeof FormDatepicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default datepicker
 */
export const Default: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker label="Select Date" value={date} onChange={setDate} />
    );
  },
};

/**
 * With initial value
 */
export const WithValue: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(new Date());

    return (
      <FormDatepicker label="Birth Date" value={date} onChange={setDate} />
    );
  },
};

/**
 * US date format (MM/dd/yyyy)
 */
export const USFormat: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker
        label="Appointment Date"
        value={date}
        onChange={setDate}
        dateFormat="MM/dd/yyyy"
        placeholderText="MM/DD/YYYY"
      />
    );
  },
};

/**
 * With help text
 */
export const WithHelpText: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker
        label="Event Date"
        value={date}
        onChange={setDate}
        helpText="Choose the date when your event will take place"
      />
    );
  },
};

/**
 * Required field
 */
export const Required: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker
        label="Start Date"
        value={date}
        onChange={setDate}
        isRequired
        helpText="This field is required"
      />
    );
  },
};

/**
 * Disabled datepicker
 */
export const Disabled: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    return (
      <FormDatepicker
        label="Locked Date"
        value={new Date()}
        onChange={() => {}}
        isDisabled
      />
    );
  },
};

/**
 * With min date (future dates only)
 */
export const FutureDatesOnly: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);
    const today = new Date();

    return (
      <FormDatepicker
        label="Delivery Date"
        value={date}
        onChange={setDate}
        minDate={today}
        helpText="Select a date in the future"
      />
    );
  },
};

/**
 * With max date (past dates only)
 */
export const PastDatesOnly: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);
    const today = new Date();

    return (
      <FormDatepicker
        label="Date of Birth"
        value={date}
        onChange={setDate}
        maxDate={today}
        helpText="You cannot select a future date"
      />
    );
  },
};

/**
 * Date range (min and max)
 */
export const DateRange: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);
    const minDate = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);

    return (
      <FormDatepicker
        label="Booking Date"
        value={date}
        onChange={setDate}
        minDate={minDate}
        maxDate={maxDate}
        helpText="Available dates: next 30 days only"
      />
    );
  },
};

/**
 * Without year dropdown
 */
export const NoYearDropdown: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker
        label="Date"
        value={date}
        onChange={setDate}
        showYearDropdown={false}
      />
    );
  },
};

/**
 * Without month dropdown
 */
export const NoMonthDropdown: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  render: () => {
    const [date, setDate] = useState<Date | null>(null);

    return (
      <FormDatepicker
        label="Date"
        value={date}
        onChange={setDate}
        showMonthDropdown={false}
      />
    );
  },
};

/**
 * Different date formats
 */
export const DateFormats: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [date1, setDate1] = useState<Date | null>(new Date());
    const [date2, setDate2] = useState<Date | null>(new Date());
    const [date3, setDate3] = useState<Date | null>(new Date());
    const [date4, setDate4] = useState<Date | null>(new Date());

    return (
      <div className="space-y-4">
        <FormDatepicker
          label="ISO Format (yyyy-MM-dd)"
          value={date1}
          onChange={setDate1}
          dateFormat="yyyy-MM-dd"
        />

        <FormDatepicker
          label="US Format (MM/dd/yyyy)"
          value={date2}
          onChange={setDate2}
          dateFormat="MM/dd/yyyy"
        />

        <FormDatepicker
          label="European Format (dd/MM/yyyy)"
          value={date3}
          onChange={setDate3}
          dateFormat="dd/MM/yyyy"
        />

        <FormDatepicker
          label="Long Format (MMMM d, yyyy)"
          value={date4}
          onChange={setDate4}
          dateFormat="MMMM d, yyyy"
        />
      </div>
    );
  },
};

/**
 * Form with date fields
 */
export const FormExample: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Event Details</h4>

        <FormDatepicker
          label="Start Date"
          value={startDate}
          onChange={setStartDate}
          isRequired
          helpText="When does the event start?"
        />

        <FormDatepicker
          label="End Date"
          value={endDate}
          onChange={setEndDate}
          minDate={startDate || undefined}
          isRequired
          helpText="When does the event end?"
        />

        {startDate && endDate && (
          <div className="pt-4 border-t border-white/[0.08]">
            <div className="text-sm text-foreground/70">
              Duration:{' '}
              {Math.ceil(
                (endDate.getTime() - startDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              )}{' '}
              days
            </div>
          </div>
        )}
      </div>
    );
  },
};

/**
 * Booking form example
 */
export const BookingForm: Story = {
  args: {
    label: 'Date',
    onChange: () => {},
    value: new Date(),
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [checkIn, setCheckIn] = useState<Date | null>(null);
    const [checkOut, setCheckOut] = useState<Date | null>(null);
    const today = new Date();

    return (
      <div className="space-y-4">
        <h4 className="font-semibold">Hotel Booking</h4>

        <FormDatepicker
          label="Check-in Date"
          value={checkIn}
          onChange={setCheckIn}
          minDate={today}
          isRequired
          dateFormat="MM/dd/yyyy"
          placeholderText="Select check-in date"
        />

        <FormDatepicker
          label="Check-out Date"
          value={checkOut}
          onChange={setCheckOut}
          minDate={checkIn || today}
          isRequired
          dateFormat="MM/dd/yyyy"
          placeholderText="Select check-out date"
          isDisabled={!checkIn}
          helpText={!checkIn ? 'Please select check-in date first' : undefined}
        />

        {checkIn && checkOut && (
          <div className="bg-background p-4 space-y-2">
            <div className="font-semibold">Booking Summary:</div>
            <div className="text-sm">
              <div>Check-in: {checkIn.toLocaleDateString()}</div>
              <div>Check-out: {checkOut.toLocaleDateString()}</div>
              <div className="font-semibold mt-2">
                Total nights:{' '}
                {Math.ceil(
                  (checkOut.getTime() - checkIn.getTime()) /
                    (1000 * 60 * 60 * 24),
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
};
