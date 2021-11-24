import { Input } from "@chakra-ui/input";
import { Box, Button, Center, ChakraProvider, Container, FormControl, FormErrorMessage, FormHelperText, FormLabel, Heading, Stack, useToast } from "@chakra-ui/react";
import React, { ChangeEventHandler, Dispatch, FC, FormEventHandler, MouseEventHandler, useEffect, useRef, useState } from "react";
import {
  BrowserRouter as Router, Route, Routes, useNavigate, useParams
} from "react-router-dom";
import ChatRoom from './ChatRoom';
import { fetchHiddenRoomID } from './utils/chatRoomHelper';

export const App: FC = () => {
  const [name, setName] = useState<string>("");
  const [room, setRoom] = useState<string>("");

  return (
    <ChakraProvider>
      <Router>
        <Routes>
          <Route path="/" element={<NameForm name={name} setName={setName} />} />
          <Route path="/name/:roomId" element={<NameForm name={name} setName={setName} />} />
          <Route path="/room/:roomId" element={<ChatRoom name={name} />} />
          <Route path="/room" element={<RoomForm name={name} room={room} setRoom={setRoom} />} />
        </Routes>
      </Router>
    </ChakraProvider>
  );
}

interface NameFormProps {
  name: string;
  setName: Dispatch<React.SetStateAction<string>>
}
const NameForm: FC<NameFormProps> = ({ name, setName }) => {
  const [nameError, setNameError] = useState<string>("");
  const nameInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const room: string = useParams().roomId || '';

  useEffect(() => { nameInput.current?.focus() }, [])

  const validateName = (newName: string = name) => {
    let valid: boolean = false;
    if (!newName) {
      setNameError("Name cannot be empty")
    } else if (newName.length > 32) {
      setNameError("Name cannot exceed 32 characters")
    } else {
      setNameError("")
      valid = true;
    }
    return valid;
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const valid = validateName();
    if (valid) {
      navigate(room ? `/room/${room}` : '/room')
    }
  }

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const newName = event.target.value;
    setName(newName);
    validateName(newName);
  }

  return <Center height="100vh">
    <Container>
      <form onSubmit={handleSubmit}>
        <FormControl id="name" isRequired isInvalid={!!nameError}>
          <FormLabel>Display Name</FormLabel>
          <Input value={name} onChange={handleChange} placeholder="Your name" ref={nameInput} />
          <FormHelperText>What display name would you like? Participants in this chat are random people on the internet. Names are not authenticated. Anyone can pretend to be anyone. Chat history is saved.</FormHelperText>
          <FormErrorMessage>{nameError}</FormErrorMessage>
        </FormControl>
        <Stack><Button type="submit" disabled={!!nameError}>Submit</Button></Stack>
      </form>
    </Container>
  </Center>
};

interface RoomFormProps {
  name: string;
  room: string;
  setRoom: Dispatch<React.SetStateAction<string>>
}

const RoomForm: FC<RoomFormProps> = ({ name, room, setRoom }) => {
  const [roomError, setRoomError] = useState<string>("");
  const roomInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!name) {
      navigate("/")
    }
    roomInput.current?.focus()
  }, [name, navigate])

  const validateRoom = (newRoom: string = room) => {
    let valid: boolean = true;
    if (!newRoom) {
      setRoomError("Room name cannot be empty")
    } else if (newRoom.length > 32) {
      setRoomError("Room name cannot exceed 32 characters")
    } else {
      setRoomError("")
      valid = true
    }
    return valid
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const valid = validateRoom()
    if (valid) {
      navigate(`/room/${encodeURIComponent(room)}`)
    }
  }

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const newRoom = event.target.value;
    setRoom(newRoom);
    validateRoom(newRoom)
  }

  const handleHiddenRoom: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.preventDefault();
    try {
      const hiddenRoomID = await fetchHiddenRoomID();
      navigate(`/room/${encodeURIComponent(hiddenRoomID)}`)
    } catch (error) {
      if (!toast.isActive('fetch-hidden')) {
        toast({
          id: 'fetch-hidden',
          title: 'Error: Could not fetch hidden room ID'
        })
      }
      console.error(error);
    }
  }

  return <Center height="100vh">
    <Container>
      <Heading>Welcome, {name}!</Heading>
      <Box borderWidth="1px" borderRadius="lg">
        <Box p={3}>
          <form onSubmit={handleSubmit}>
            <FormControl id="room" isRequired isInvalid={!!roomError}>
              <FormLabel>Public Room Name</FormLabel>
              <Input value={room} onChange={handleChange} placeholder="Room name" ref={roomInput} />
              <FormHelperText>What public room would you like to join?</FormHelperText>
              <FormErrorMessage>{roomError}</FormErrorMessage>
            </FormControl>
            <Stack><Button type="submit" disabled={!!roomError}>Submit</Button></Stack>
          </form>
        </Box>
      </Box>
      <Center height='6em'><Heading>Or</Heading></Center>
      <Box borderWidth="1px" borderRadius="lg">
        <Box p={3}>
          <Stack><Button onClick={handleHiddenRoom}>Create Hidden Room</Button></Stack>
        </Box>
      </Box>
    </Container>
  </Center>;
}

export default App;
