import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  Stack,
  Switch,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRef } from "react";
import { VscCloudDownload, VscCloudUpload } from "react-icons/vsc";

import type { ProctoringStats } from "./App";
import ConnectionStatus from "./ConnectionStatus";
import User from "./User";
import type { UserInfo } from "./examiner";
import languages from "./languages.json";

/** Compute the candidate share link (no examiner token). */
function getCandidateUrl(documentId: string): string {
  return `${window.location.origin}/#${documentId}`;
}

/** Human-readable labels for proctoring event types. */
const eventLabels: Record<string, string> = {
  tab_switch: "Tab Switches",
  copy_attempt: "Copy Attempts",
  paste_attempt: "Paste Attempts",
  cut_attempt: "Cut Attempts",
  screenshot_attempt: "Screenshot Attempts",
  devtools_open: "DevTools Opened",
  ai_tool_detected: "AI Tool Detected",
  mouse_left: "Mouse Left Browser",
};

export type SidebarProps = {
  documentId: string;
  connection: "connected" | "disconnected" | "desynchronized";
  darkMode: boolean;
  language: string;
  currentUser: UserInfo;
  users: Record<number, UserInfo>;
  userFocusStatus: Record<number, boolean>;
  focusLossCount: number;
  isCreator: boolean;
  userProctoringStats: ProctoringStats;
  onDarkModeChange: () => void;
  onLanguageChange: (language: string) => void;
  onUploadQuestions: (text: string) => void;
  onDownloadCode: () => void;
  onChangeName: (name: string) => void;
  onChangeColor: () => void;
};

function Sidebar({
  documentId,
  connection,
  darkMode,
  language,
  currentUser,
  users,
  userFocusStatus,
  focusLossCount,
  isCreator,
  userProctoringStats,
  onDarkModeChange,
  onLanguageChange,
  onUploadQuestions,
  onDownloadCode,
  onChangeName,
  onChangeColor,
}: SidebarProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Candidates get a clean URL without the examiner token.
  const shareUrl = getCandidateUrl(documentId);

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      onUploadQuestions(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // Aggregate all proctoring events across all users for a summary
  const totalStats: Record<string, number> = {};
  for (const userStats of Object.values(userProctoringStats)) {
    for (const [event, count] of Object.entries(userStats)) {
      totalStats[event] = (totalStats[event] ?? 0) + count;
    }
  }
  const hasAnyStats = Object.keys(totalStats).length > 0 || focusLossCount > 0;

  return (
    <Container
      w={{ base: "3xs", md: "2xs", lg: "xs" }}
      display={{ base: "none", sm: "block" }}
      bgColor={darkMode ? "#252526" : "#f3f3f3"}
      overflowY="auto"
      maxW="full"
      lineHeight={1.4}
      py={4}
    >
      <ConnectionStatus darkMode={darkMode} connection={connection} />

      <Flex justifyContent="space-between" mt={4} mb={1.5} w="full">
        <Heading size="sm">Dark Mode</Heading>
        <Switch isChecked={darkMode} onChange={onDarkModeChange} />
      </Flex>

      <Heading mt={4} mb={1.5} size="sm">
        Language
      </Heading>
      <Select
        size="sm"
        bgColor={darkMode ? "#3c3c3c" : "white"}
        borderColor={darkMode ? "#3c3c3c" : "white"}
        value={language}
        onChange={(event) => onLanguageChange(event.target.value)}
      >
        {languages.map((lang) => (
          <option key={lang} value={lang} style={{ color: "black" }}>
            {lang}
          </option>
        ))}
      </Select>

      {isCreator && (
        <>
          <Heading mt={4} mb={1.5} size="sm">
            Share Link
          </Heading>
          <InputGroup size="sm">
            <Input
              readOnly
              pr="3.5rem"
              variant="outline"
              bgColor={darkMode ? "#3c3c3c" : "white"}
              borderColor={darkMode ? "#3c3c3c" : "white"}
              value={shareUrl}
            />
            <InputRightElement width="3.5rem">
              <Button
                h="1.4rem"
                size="xs"
                onClick={handleCopy}
                _hover={{ bg: darkMode ? "#575759" : "gray.200" }}
                bgColor={darkMode ? "#575759" : "gray.200"}
                color={darkMode ? "white" : "inherit"}
              >
                Copy
              </Button>
            </InputRightElement>
          </InputGroup>
        </>
      )}

      <Heading mt={4} mb={1.5} size="sm">
        Active Users
      </Heading>
      <Stack spacing={0} mb={1.5} fontSize="sm">
        <User
          info={currentUser}
          isMe
          onChangeName={onChangeName}
          onChangeColor={onChangeColor}
          darkMode={darkMode}
        />
        {Object.entries(users).map(([id, info]) => (
          <User
            key={id}
            info={info}
            darkMode={darkMode}
            isBlurred={isCreator ? userFocusStatus[Number(id)] : false}
          />
        ))}
      </Stack>

      {/* Proctoring stats — only visible to examiner */}
      {isCreator && hasAnyStats && (
        <Box
          mt={2}
          p={2}
          bg={darkMode ? "#3c3c3c" : "red.50"}
          border="1px solid"
          borderColor={darkMode ? "#555" : "red.300"}
          borderRadius="md"
          fontSize="xs"
        >
          <Text
            color={darkMode ? "red.300" : "red.700"}
            fontWeight="bold"
            mb={1}
          >
            Proctoring Alerts
          </Text>
          {Object.entries(totalStats).map(([event, count]) => (
            <Text key={event} color={darkMode ? "red.200" : "red.600"}>
              {eventLabels[event] ?? event}: {count}
            </Text>
          ))}

          {/* Per-user breakdown */}
          {Object.entries(userProctoringStats).map(([userId, stats]) => {
            const userInfo = users[Number(userId)];
            const userName = userInfo?.name ?? `User ${userId}`;
            return (
              <Box
                key={userId}
                mt={2}
                pt={1}
                borderTop="1px solid"
                borderColor={darkMode ? "#555" : "red.200"}
              >
                <Text
                  color={darkMode ? "orange.200" : "orange.700"}
                  fontWeight="semibold"
                >
                  {userName}
                </Text>
                {Object.entries(stats).map(([event, count]) => (
                  <Text
                    key={event}
                    color={darkMode ? "gray.300" : "red.600"}
                    pl={2}
                  >
                    {eventLabels[event] ?? event}: {count}
                  </Text>
                ))}
              </Box>
            );
          })}
        </Box>
      )}

      {isCreator && (
        <>
          <Heading mt={4} mb={1.5} size="sm">
            Interview Tools
          </Heading>
          <input
            type="file"
            accept=".txt,.md"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <Stack spacing={2}>
            <Button
              size="sm"
              colorScheme={darkMode ? "whiteAlpha" : "blackAlpha"}
              borderColor={darkMode ? "blue.400" : "blue.600"}
              color={darkMode ? "blue.400" : "blue.600"}
              variant="outline"
              leftIcon={<VscCloudUpload />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Questions
            </Button>
            <Button
              size="sm"
              colorScheme={darkMode ? "whiteAlpha" : "blackAlpha"}
              borderColor={darkMode ? "green.400" : "green.600"}
              color={darkMode ? "green.400" : "green.600"}
              variant="outline"
              leftIcon={<VscCloudDownload />}
              onClick={onDownloadCode}
            >
              Download Code
            </Button>
          </Stack>
        </>
      )}

      <Heading mt={4} mb={1.5} size="sm">
        About
      </Heading>
      <Text fontSize="sm" mb={1.5}>
        <strong>Examiner</strong> is a proctored collaborative code editor for
        conducting coding interviews in real time.
      </Text>
      <Text fontSize="sm" mb={1.5}>
        {isCreator
          ? "Upload a questions file to begin. Share the link with candidates. Download the code when the interview is complete."
          : "Copy and paste are disabled. Your activity is being monitored."}
      </Text>
      <Text fontSize="xs" mt={2}>
        <a
          href="https://github.com/harshalsoni/examiner"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          GitHub
        </a>
        {" • "}
        <a
          href="https://buymeacoffee.com/mrgoldman"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          Buy Me a Coffee
        </a>
      </Text>
    </Container>
  );
}

export default Sidebar;
