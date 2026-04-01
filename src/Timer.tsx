import { Badge, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export type TimerDisplayProps = {
  /** Unix epoch milliseconds when the timer expires, or null if inactive. */
  endTime: number | null;
  /** Optional label shown alongside the timer. */
  label: string | null;
  darkMode: boolean;
};

/** Format remaining seconds as MM:SS. */
function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Compact countdown timer display for the toolbar. */
function TimerDisplay({ endTime, label, darkMode }: TimerDisplayProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (endTime === null) {
      setRemaining(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemaining(diff);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [endTime]);

  if (remaining === null) return null;

  const isExpired = remaining <= 0;
  const isUrgent = remaining > 0 && remaining <= 60;
  const isWarning = remaining > 60 && remaining <= 300;

  let colorScheme: string;
  if (isExpired) colorScheme = "red";
  else if (isUrgent) colorScheme = "red";
  else if (isWarning) colorScheme = "orange";
  else colorScheme = darkMode ? "blue" : "blue";

  return (
    <HStack spacing={1.5}>
      {label && (
        <Text fontSize="xs" color={darkMode ? "#aaa" : "#666"} noOfLines={1}>
          {label}
        </Text>
      )}
      <Badge
        colorScheme={colorScheme}
        variant={isExpired || isUrgent ? "solid" : "subtle"}
        fontSize="xs"
        px={2}
        py={0.5}
        borderRadius="md"
        fontFamily="mono"
        data-testid="timer-badge"
      >
        ⏱ {isExpired ? "Time's up!" : formatTime(remaining)}
      </Badge>
    </HStack>
  );
}

export default TimerDisplay;
