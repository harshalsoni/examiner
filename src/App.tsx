import { Box, Flex, HStack, Icon, Text, useToast } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import {
  editor,
  KeyCode,
  KeyMod,
} from "monaco-editor/esm/vs/editor/editor.api";
import { useEffect, useRef, useState } from "react";
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
  const examiner = useRef<Examiner>();
  const id = useHash();

  // Global page-level clipboard fallback
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      e.preventDefault();
    };
    document.addEventListener("paste", handler, true);
    document.addEventListener("copy", handler, true);
    document.addEventListener("cut", handler, true);
    return () => {
      document.removeEventListener("paste", handler, true);
      document.removeEventListener("copy", handler, true);
      document.removeEventListener("cut", handler, true);
    };
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
      });
      return () => {
        examiner.current?.dispose();
        examiner.current = undefined;
      };
    }
  }, [id, editorInstance, toast, setUsers]);

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
          <Box flex={1} minH={0}>
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
          </Box>
        </Flex>
      </Flex>
      <Footer />
    </Flex>
  );
}

export default App;
