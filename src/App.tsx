import { Box, Flex, HStack, Icon, Text, useToast } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import {
  editor,
  KeyCode,
  KeyMod,
} from "monaco-editor/esm/vs/editor/editor.api";
import { useCallback, useEffect, useRef, useState } from "react";
import { VscChevronRight, VscFolderOpened, VscGist } from "react-icons/vsc";
import useLocalStorageState from "use-local-storage-state";

import Footer from "./Footer";
import Sidebar from "./Sidebar";
import animals from "./animals.json";
import languages from "./languages.json";
import Examiner, { UserInfo } from "./examiner";
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

/** Enables proctored mode on a Monaco editor instance, blocking clipboard and drag-drop. */
function enableProctoredMode(ed: editor.IStandaloneCodeEditor) {
  // Layer 1: Override Monaco clipboard keybindings
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyC, () => {});
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyX, () => {});
  ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyV, () => {});
  ed.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {});

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
  const examiner = useRef<Examiner>();
  const id = useHash();

  const handleFocusChange = useCallback(
    (userId: number, blurred: boolean) => {
      setUserFocusStatus((prev) => ({ ...prev, [userId]: blurred }));
      if (blurred) {
        toast({
          title: "User switched away",
          description: `A user has left the interview window.`,
          status: "warning",
          duration: 5000,
          isClosable: true,
        });
      }
    },
    [toast],
  );

  // Global page-level clipboard fallback and context menu blocking
  useEffect(() => {
    const clipboardHandler = (e: ClipboardEvent) => {
      e.preventDefault();
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
      }
    };
    const handleBlur = () => {
      examiner.current?.sendFocusChange(true);
      setFocusLossCount((c) => c + 1);
      toast({
        title: "Focus lost detected",
        description:
          "Switching away from the interview window is being recorded.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
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
  }, [toast]);

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
        examiner.current?.sendFocusChange(true);
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
        examiner.current?.sendFocusChange(true);
        setFocusLossCount((c) => c + 1);
        return;
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [toast]);

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
      });
      return () => {
        examiner.current?.dispose();
        examiner.current = undefined;
      };
    }
  }, [id, editorInstance, toast, setUsers, handleFocusChange]);

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
      <Box
        flexShrink={0}
        bgColor="#c62828"
        color="white"
        textAlign="center"
        fontSize="sm"
        py={0.5}
      >
        Examiner — Proctored Mode
      </Box>
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
                enableProctoredMode(ed);
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
          </Box>
        </Flex>
      </Flex>
      <Footer />
    </Flex>
  );
}

export default App;
