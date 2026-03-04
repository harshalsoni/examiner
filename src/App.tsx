import { Box, Flex, HStack, Icon, Text, useToast } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import {
  KeyCode,
  KeyMod,
  editor,
} from "monaco-editor/esm/vs/editor/editor.api";
import { useCallback, useEffect, useRef, useState } from "react";
import { VscChevronRight, VscFolderOpened, VscGist } from "react-icons/vsc";
import useLocalStorageState from "use-local-storage-state";

import Footer from "./Footer";
import Sidebar from "./Sidebar";
import animals from "./animals.json";
import Examiner, { UserInfo } from "./examiner";
import languages from "./languages.json";
import useHash from "./useHash";

function getWsUri(id: string) {
  let url = new URL(`api/socket/${id}`, window.location.href);
  url.protocol = url.protocol == "https:" ? "wss:" : "ws:";
  return url.href;
}

function generateName() {
  return "Anonymous " + animals[Math.floor(Math.random() * animals.length)];
}

function generateHue() {
  return Math.floor(Math.random() * 360);
}

/** Compute a deterministic token from session ID to identify the examiner. */
function computeExaminerToken(sessionId: string): string {
  const input = sessionId + "::proctoring::v1";
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Check if the current user is the examiner based on URL token. */
function checkIsCreator(sessionId: string): boolean {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");
  if (!token) return false;
  return token === computeExaminerToken(sessionId);
}

/** On first visit (no token), inject the examiner token into the URL. */
function initExaminerUrl(sessionId: string) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("t")) {
    const token = computeExaminerToken(sessionId);
    params.set("t", token);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }
}

/** Per-user proctoring stats type. */
export type ProctoringStats = Record<number, Record<string, number>>;

/** Enables proctored mode on a Monaco editor instance, blocking clipboard and drag-drop. */
function enableProctoredMode(
  ed: editor.IStandaloneCodeEditor,
  onClipboardAttempt?: (eventType: string) => void,
) {
  // Layer 1: Override Monaco clipboard keybindings
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyC, () => {
    onClipboardAttempt?.("copy_attempt");
  });
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyX, () => {
    onClipboardAttempt?.("cut_attempt");
  });
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyV, () => {
    onClipboardAttempt?.("paste_attempt");
  });
  ed.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
    onClipboardAttempt?.("paste_attempt");
  });

  // Layer 2: DOM-level clipboard event blocking
  const domNode = ed.getDomNode();
  if (domNode) {
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    domNode.addEventListener("copy", block, true);
    domNode.addEventListener("cut", block, true);
    domNode.addEventListener("paste", block, true);

    // Layer 3: Block drag-and-drop
    domNode.addEventListener("drop", block, true);
    domNode.addEventListener("dragover", block, true);
  }

  // Layer 4: Disable context menu
  ed.updateOptions({ contextmenu: false });
}

function App() {
  const toast = useToast();
  const [language, setLanguage] = useState("plaintext");
  const [connection, setConnection] = useState<
    "connected" | "disconnected" | "desynchronized"
  >("disconnected");
  const [users, setUsers] = useState<Record<number, UserInfo>>({});
  const [name, setName] = useLocalStorageState("name", {
    defaultValue: generateName,
  });
  const [hue, setHue] = useLocalStorageState("hue", {
    defaultValue: generateHue,
  });
  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor>();
  const [darkMode, setDarkMode] = useLocalStorageState("darkMode", {
    defaultValue: false,
  });
  const [userFocusStatus, setUserFocusStatus] = useState<
    Record<number, boolean>
  >({});
  const [focusLossCount, setFocusLossCount] = useState(0);
  const [userProctoringStats, setUserProctoringStats] =
    useState<ProctoringStats>({});
  const [isMouseOutside, setIsMouseOutside] = useState(false);
  const examiner = useRef<Examiner>();
  const { id, isNewSession } = useHash();

  // Role detection: examiner is the user who created the session (generated the hash).
  // Candidates arrive via a shared link where the hash already exists in the URL.
  const [isCreator] = useState(() => {
    if (isNewSession) {
      // This browser generated the hash — this is the session creator (examiner)
      initExaminerUrl(id);
      return true;
    }
    return checkIsCreator(id);
  });

  // Track AI tool detection flags to avoid duplicate events
  const aiDetectedRef = useRef<Set<string>>(new Set());

  const handleFocusChange = useCallback((userId: number, blurred: boolean) => {
    setUserFocusStatus((prev) => ({ ...prev, [userId]: blurred }));
  }, []);

  const handleProctoringEvent = useCallback(
    (userId: number, eventType: string) => {
      setUserProctoringStats((prev) => {
        const userStats = prev[userId] ?? {};
        return {
          ...prev,
          [userId]: {
            ...userStats,
            [eventType]: (userStats[eventType] ?? 0) + 1,
          },
        };
      });
    },
    [],
  );

  // Global page-level clipboard fallback and context menu blocking
  useEffect(() => {
    const clipboardHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      const eventType =
        e.type === "paste"
          ? "paste_attempt"
          : e.type === "cut"
            ? "cut_attempt"
            : "copy_attempt";
      examiner.current?.sendProctoringEvent(eventType);
    };
    const contextMenuHandler = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener("paste", clipboardHandler, true);
    document.addEventListener("copy", clipboardHandler, true);
    document.addEventListener("cut", clipboardHandler, true);
    document.addEventListener("contextmenu", contextMenuHandler, true);
    return () => {
      document.removeEventListener("paste", clipboardHandler, true);
      document.removeEventListener("copy", clipboardHandler, true);
      document.removeEventListener("cut", clipboardHandler, true);
      document.removeEventListener("contextmenu", contextMenuHandler, true);
    };
  }, []);

  // Tab/window focus monitoring — detect when candidate switches away
  useEffect(() => {
    const handleVisibilityChange = () => {
      const blurred = document.hidden;
      examiner.current?.sendFocusChange(blurred);
      if (blurred) {
        setFocusLossCount((c) => c + 1);
        examiner.current?.sendProctoringEvent("tab_switch");
      }
    };
    const handleBlur = () => {
      // Only update focus state; counting is handled by visibilitychange
      // to avoid double-incrementing (both events fire on tab switch).
      if (!document.hidden) {
        examiner.current?.sendFocusChange(true);
      }
    };
    const handleFocus = () => {
      examiner.current?.sendFocusChange(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Screenshot key blocking
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Block PrintScreen
      if (e.key === "PrintScreen") {
        e.preventDefault();
        toast({
          title: "Screenshots are not allowed",
          description: "This action has been recorded.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        examiner.current?.sendProctoringEvent("screenshot_attempt");
        setFocusLossCount((c) => c + 1);
        return;
      }
      // Block macOS screenshot shortcuts: Cmd+Shift+3/4/5
      if (
        e.metaKey &&
        e.shiftKey &&
        (e.key === "3" || e.key === "4" || e.key === "5")
      ) {
        e.preventDefault();
        toast({
          title: "Screenshots are not allowed",
          description: "This action has been recorded.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        examiner.current?.sendProctoringEvent("screenshot_attempt");
        setFocusLossCount((c) => c + 1);
        return;
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [toast]);

  // Mouse leave/enter detection — blur screen when mouse leaves browser window
  useEffect(() => {
    const handleMouseLeave = () => {
      setIsMouseOutside(true);
      examiner.current?.sendProctoringEvent("mouse_left");
    };
    const handleMouseEnter = () => {
      setIsMouseOutside(false);
    };
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    return () => {
      document.documentElement.removeEventListener(
        "mouseleave",
        handleMouseLeave,
      );
      document.documentElement.removeEventListener(
        "mouseenter",
        handleMouseEnter,
      );
    };
  }, []);

  // AI tool and DevTools detection (best effort)
  useEffect(() => {
    const detected = aiDetectedRef.current;

    const checkAiTools = () => {
      // Detect DevTools via window dimension heuristic
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if ((widthDiff > 200 || heightDiff > 200) && !detected.has("devtools")) {
        detected.add("devtools");
        examiner.current?.sendProctoringEvent("devtools_open");
      }

      // Scan for known AI Chrome extension DOM injections
      const aiSelectors = [
        '[id*="claude"]',
        '[class*="claude"]',
        '[id*="chatgpt"]',
        '[class*="chatgpt"]',
        '[id*="copilot"]',
        '[class*="copilot"]',
        '[id*="codeium"]',
        '[class*="codeium"]',
        '[id*="cursor"]',
        '[class*="cursor-ai"]',
        '[id*="grammarly"]',
      ];
      for (const selector of aiSelectors) {
        try {
          const el = document.querySelector(selector);
          if (el && !detected.has(selector)) {
            detected.add(selector);
            examiner.current?.sendProctoringEvent("ai_tool_detected");
          }
        } catch {
          // Ignore invalid selectors
        }
      }
    };

    const intervalId = window.setInterval(checkAiTools, 5000);
    // Run once immediately
    checkAiTools();
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (editorInstance?.getModel()) {
      const model = editorInstance.getModel()!;
      model.setValue("");
      model.setEOL(0); // LF
      examiner.current = new Examiner({
        uri: getWsUri(id),
        editor: editorInstance,
        onConnected: () => setConnection("connected"),
        onDisconnected: () => setConnection("disconnected"),
        onDesynchronized: () => {
          setConnection("desynchronized");
          toast({
            title: "Desynchronized with server",
            description: "Please save your work and refresh the page.",
            status: "error",
            duration: null,
          });
        },
        onChangeLanguage: (language) => {
          if (languages.includes(language)) {
            setLanguage(language);
          }
        },
        onChangeUsers: setUsers,
        onFocusChange: handleFocusChange,
        onProctoringEvent: handleProctoringEvent,
      });
      return () => {
        examiner.current?.dispose();
        examiner.current = undefined;
      };
    }
  }, [
    id,
    editorInstance,
    toast,
    setUsers,
    handleFocusChange,
    handleProctoringEvent,
  ]);

  useEffect(() => {
    if (connection === "connected") {
      examiner.current?.setInfo({ name, hue });
    }
  }, [connection, name, hue]);

  function handleLanguageChange(language: string) {
    setLanguage(language);
    if (examiner.current?.setLanguage(language)) {
      toast({
        title: "Language updated",
        description: (
          <>
            All users are now editing in{" "}
            <Text as="span" fontWeight="semibold">
              {language}
            </Text>
            .
          </>
        ),
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    }
  }

  function handleUploadQuestions(text: string) {
    if (editorInstance?.getModel()) {
      const model = editorInstance.getModel()!;
      model.pushEditOperations(
        editorInstance.getSelections(),
        [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            },
            text: text + "\n\n// --- Write your solution below ---\n\n",
          },
        ],
        () => null,
      );
      editorInstance.setPosition({ lineNumber: 1, column: 1 });
    }
  }

  function handleDownloadCode() {
    if (editorInstance?.getModel()) {
      const text = editorInstance.getModel()!.getValue();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `examiner-${id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function handleDarkModeChange() {
    setDarkMode(!darkMode);
  }

  return (
    <Flex
      direction="column"
      h="100vh"
      overflow="hidden"
      bgColor={darkMode ? "#1e1e1e" : "white"}
      color={darkMode ? "#cbcaca" : "inherit"}
    >
      <Flex flex="1 0" minH={0}>
        <Sidebar
          documentId={id}
          connection={connection}
          darkMode={darkMode}
          language={language}
          currentUser={{ name, hue }}
          users={users}
          userFocusStatus={userFocusStatus}
          focusLossCount={focusLossCount}
          isCreator={isCreator}
          userProctoringStats={userProctoringStats}
          onDarkModeChange={handleDarkModeChange}
          onLanguageChange={handleLanguageChange}
          onUploadQuestions={handleUploadQuestions}
          onDownloadCode={handleDownloadCode}
          onChangeName={(name) => name.length > 0 && setName(name)}
          onChangeColor={() => setHue(generateHue())}
        />

        <Flex flex={1} minW={0} h="100%" direction="column" overflow="hidden">
          <HStack
            h={6}
            spacing={1}
            color="#888888"
            fontWeight="medium"
            fontSize="13px"
            px={3.5}
            flexShrink={0}
          >
            <Icon as={VscFolderOpened} fontSize="md" color="blue.500" />
            <Text>documents</Text>
            <Icon as={VscChevronRight} fontSize="md" />
            <Icon as={VscGist} fontSize="md" color="purple.500" />
            <Text>{id}</Text>
          </HStack>
          <Box flex={1} minH={0} position="relative">
            <Editor
              theme={darkMode ? "vs-dark" : "vs"}
              language={language}
              options={{
                automaticLayout: true,
                fontSize: 13,
                contextmenu: false,
                dragAndDrop: false,
              }}
              onMount={(ed) => {
                enableProctoredMode(ed, (eventType) => {
                  examiner.current?.sendProctoringEvent(eventType);
                });
                setEditorInstance(ed);
              }}
            />
            {/* Watermark overlay — makes screenshots traceable */}
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              pointerEvents="none"
              zIndex={10}
              opacity={0.06}
              backgroundImage={`url("data:image/svg+xml,${encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'>
                  <text transform='rotate(-30 150 100)' x='50%' y='50%' font-family='monospace' font-size='14' fill='${darkMode ? "white" : "black"}' text-anchor='middle' dominant-baseline='middle'>${name} | ${id}</text>
                </svg>`,
              )}")`}
              backgroundRepeat="repeat"
            />
            {/* Blur overlay when mouse leaves the browser window */}
            {!isCreator && isMouseOutside && (
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                zIndex={20}
                backdropFilter="blur(8px)"
                backgroundColor={
                  darkMode ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.5)"
                }
                display="flex"
                alignItems="center"
                justifyContent="center"
                pointerEvents="none"
              >
                <Box
                  dangerouslySetInnerHTML={{
                    __html: `
                      <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                        <!-- Robot Head -->
                        <rect x="25" y="35" width="70" height="60" rx="8"
                              fill="${darkMode ? "#FC8181" : "#E53E3E"}"
                              stroke="${darkMode ? "#FEB2B2" : "#C53030"}"
                              stroke-width="2"/>

                        <!-- Antenna -->
                        <line x1="60" y1="35" x2="60" y2="20"
                              stroke="${darkMode ? "#FEB2B2" : "#C53030"}"
                              stroke-width="2" stroke-linecap="round"/>
                        <circle cx="60" cy="18" r="4"
                                fill="${darkMode ? "#FEB2B2" : "#C53030"}"/>

                        <!-- Eyes -->
                        <circle cx="45" cy="55" r="8"
                                fill="${darkMode ? "#2D3748" : "#FFFFFF"}"
                                opacity="0.9"/>
                        <circle cx="75" cy="55" r="8"
                                fill="${darkMode ? "#2D3748" : "#FFFFFF"}"
                                opacity="0.9"/>
                        <circle cx="45" cy="55" r="4"
                                fill="${darkMode ? "#FEB2B2" : "#C53030"}"/>
                        <circle cx="75" cy="55" r="4"
                                fill="${darkMode ? "#FEB2B2" : "#C53030"}"/>

                        <!-- Mouth (sad/warning) -->
                        <path d="M 45 75 Q 60 70 75 75"
                              stroke="${darkMode ? "#2D3748" : "#FFFFFF"}"
                              stroke-width="2"
                              fill="none"
                              stroke-linecap="round"
                              opacity="0.8"/>

                        <!-- Code brackets decoration -->
                        <text x="35" y="85"
                              font-family="monospace"
                              font-size="12"
                              fill="${darkMode ? "#2D3748" : "#FFFFFF"}"
                              opacity="0.6">&lt;/&gt;</text>
                      </svg>
                    `,
                  }}
                />
              </Box>
            )}
          </Box>
        </Flex>
      </Flex>
      <Footer />
    </Flex>
  );
}

export default App;
