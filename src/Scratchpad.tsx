import {
  Box,
  Heading,
  IconButton,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { VscChevronLeft, VscChevronRight } from "react-icons/vsc";

export type ScratchpadProps = {
  darkMode: boolean;
  notes: string;
  isOpen: boolean;
  onNotesChange: (notes: string) => void;
  onToggle: () => void;
};

function Scratchpad({
  darkMode,
  notes,
  isOpen,
  onNotesChange,
  onToggle,
}: ScratchpadProps) {
  return (
    <Box position="relative" display="flex" flexShrink={0}>
      {/* Toggle button */}
      <Tooltip label={isOpen ? "Collapse scratchpad" : "Open scratchpad"}>
        <IconButton
          aria-label={isOpen ? "Collapse scratchpad" : "Open scratchpad"}
          icon={isOpen ? <VscChevronRight /> : <VscChevronLeft />}
          size="xs"
          variant="ghost"
          position="absolute"
          left="-24px"
          top="50%"
          transform="translateY(-50%)"
          zIndex={1}
          color={darkMode ? "#cbcaca" : "gray.600"}
          _hover={{ bg: darkMode ? "#3c3c3c" : "gray.200" }}
          onClick={onToggle}
        />
      </Tooltip>

      {isOpen && (
        <Box
          w={{ base: "200px", md: "250px", lg: "300px" }}
          bgColor={darkMode ? "#252526" : "#f3f3f3"}
          borderLeft="1px solid"
          borderColor={darkMode ? "#3c3c3c" : "#e0e0e0"}
          display="flex"
          flexDirection="column"
          p={3}
          overflow="hidden"
        >
          <Heading size="sm" mb={2}>
            Scratchpad
          </Heading>
          <Textarea
            flex={1}
            resize="none"
            placeholder="Jot down observations, scores, and notes…"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            fontSize="sm"
            bgColor={darkMode ? "#1e1e1e" : "white"}
            borderColor={darkMode ? "#3c3c3c" : "#e0e0e0"}
            _placeholder={{
              color: darkMode ? "gray.500" : "gray.400",
            }}
            _hover={{
              borderColor: darkMode ? "#555" : "gray.300",
            }}
            _focus={{
              borderColor: darkMode ? "blue.400" : "blue.500",
              boxShadow: "none",
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export default Scratchpad;
