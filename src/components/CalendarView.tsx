import React from "react";
import { Calendar, DateData } from "react-native-calendars";
import type { MarkedDates } from "react-native-calendars/src/types";
import { colors } from "@/theme/colors";

type Props = {
  selectedDate?: string;
  markedDates?: MarkedDates;
  onDayPress?: (dateString: string) => void;
};

export function CalendarView({ selectedDate, markedDates, onDayPress }: Props) {
  return (
    <Calendar
      markedDates={{
        ...markedDates,
        ...(selectedDate
          ? {
              [selectedDate]: {
                ...(markedDates?.[selectedDate] || {}),
                selected: true,
                selectedColor: colors.primary
              }
            }
          : {})
      }}
      theme={{
        todayTextColor: colors.info,
        arrowColor: colors.primary,
        textDayFontSize: 16,
        textMonthFontSize: 18,
        textDayHeaderFontSize: 13
      }}
      onDayPress={(day: DateData) => onDayPress?.(day.dateString)}
    />
  );
}
