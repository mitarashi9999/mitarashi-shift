import React, { useCallback, useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  error?: string;
  mode?: "text" | "time";
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toHHmm(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseTimeToDate(value: string) {
  const now = new Date();
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!matched) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  }
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(matched[1]),
    Number(matched[2]),
    0,
    0
  );
}

export function FormInput(props: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(parseTimeToDate(props.value));
  const isTimeMode = props.mode === "time";
  const isWeb = Platform.OS === "web";

  const displayValue = useMemo(
    () => (props.value?.trim().length ? props.value : "09:00"),
    [props.value]
  );

  const openPicker = useCallback(() => {
    setDraftDate(parseTimeToDate(props.value));
    setPickerVisible(true);
  }, [props.value]);

  const closePicker = useCallback(() => {
    setPickerVisible(false);
  }, []);

  if (isTimeMode && !isWeb) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>{props.label}</Text>
        <Pressable
          onPress={openPicker}
          style={[styles.timeTrigger, !!props.error && styles.inputError]}
        >
          <Text style={styles.timeValue}>{displayValue}</Text>
          <Text style={styles.timeHint}>時刻を選択</Text>
        </Pressable>
        {props.error ? <Text style={styles.error}>{props.error}</Text> : null}

        {Platform.OS === "android" && pickerVisible ? (
          <DateTimePicker
            value={draftDate}
            mode="time"
            display="clock"
            is24Hour
            onChange={(event, date) => {
              if (event.type === "set" && date) {
                props.onChangeText(toHHmm(date));
              }
              closePicker();
            }}
          />
        ) : null}

        {Platform.OS === "ios" ? (
          <Modal
            visible={pickerVisible}
            transparent
            animationType="slide"
            onRequestClose={closePicker}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{props.label}</Text>
                <DateTimePicker
                  value={draftDate}
                  mode="time"
                  display="spinner"
                  is24Hour
                  onChange={(_, date) => {
                    if (date) {
                      setDraftDate(date);
                    }
                  }}
                />
                <View style={styles.modalActions}>
                  <PrimaryButton
                    label="キャンセル"
                    variant="secondary"
                    onPress={closePicker}
                  />
                  <PrimaryButton
                    label="決定"
                    onPress={() => {
                      props.onChangeText(toHHmm(draftDate));
                      closePicker();
                    }}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        secureTextEntry={props.secureTextEntry}
        style={[styles.input, !!props.error && styles.inputError]}
        placeholderTextColor={colors.subtext}
      />
      {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    minHeight: 52,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.text
  },
  timeTrigger: {
    minHeight: 56,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: "center",
    gap: spacing.xs
  },
  timeValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  timeHint: {
    color: colors.subtext,
    fontSize: 12
  },
  inputError: {
    borderColor: colors.danger
  },
  error: {
    color: colors.danger,
    fontSize: 12
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.md
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  modalActions: {
    gap: spacing.sm
  }
});
