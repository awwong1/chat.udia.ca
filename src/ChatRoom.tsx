import { Box, Flex, Heading, HStack, VStack } from "@chakra-ui/layout";
import { Button, FormControl, FormLabel, Input, InputGroup, InputRightElement, Tag, Text } from "@chakra-ui/react";
import React, { ChangeEventHandler, FC, FormEventHandler, Fragment, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getWebSocketClient } from "./utils/chatRoomHelper";

interface ChatRoomProps {
  name: string
}
export const ChatRoom: FC<ChatRoomProps> = ({ name }) => {
  const [chatMessage, setChatMessage] = useState<string>("");
  const chatInput = useRef<HTMLInputElement>(null);
  const chatContent = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const room: string = useParams().roomId || '';

  const [messages, setChatMessages] = useState<{ name: string | null, text: string }[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [preambleSent, setPreambleSent] = useState(false);
  const [resetWsListeners, setResetWsListeners] = useState(false);

  useEffect(() => {
    if (!name) {
      navigate(`/name/${room}`)
    }
  }, [name, room, navigate])

  // Websocket useEffect spaghetti
  const wsRef = useRef<WebSocket | null>(null);
  const timestampRef = useRef(0);
  useEffect(() => {
    if (wsRef.current === null) {
      const ws = getWebSocketClient(room);
      wsRef.current = ws
      setResetWsListeners(true)
      return () => { 
        ws.close(1000, "component unmounting")
      }
    }
  }, [room])


  useEffect(() => {
    const ws = wsRef.current;
    if (ws && resetWsListeners) {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ name }));
      })
  
      ws.addEventListener('message', event => {
        const data = JSON.parse(event.data);
        if (data.error) {
          setChatMessages((msgs) => [...msgs, { name: null, text: data.error }])
        } else if (data.joined) {
          setUsers((usrs) => [...usrs, data.joined])
        } else if (data.quit) {
          setUsers((usrs) => {
            const nameIdx = usrs.indexOf(data.quit)
            if (nameIdx >= 0) {
              return usrs.slice(0, nameIdx).concat(usrs.slice(nameIdx + 1))
            }
            return usrs
          })
        } else if (data.ready) {
          // pre join messages have been delivered
          if (!preambleSent) {
            setChatMessages((msgs) => {
              const newMsgs = [
                ...msgs,
                { name: null, text: "This is a chat app built with Cloudflare Workers Durable Objects and Cloudflare Pages." },
                { name: null, text: "Participants in this chat are random people on the internet. Names are not authenticated! Anyone can pretend to be anyone." },
              ]
              if (room.length === 64) {
                newMsgs.push({ name: null, text: "This is a hidden room. You can invite someone to the room by sending them the URL." });
              } else {
                newMsgs.push({ name: null, text: "Welcome to `/room/" + room + "`. Say hi!" });
              }
              return newMsgs;
            })
            setPreambleSent(true);
          }
        } else {
          // regular message
          const { name, message, timestamp } = data
          const latestTimestamp = timestampRef.current;
          if (timestamp > latestTimestamp) {
            setChatMessages((msgs) => [...msgs, { name, text: message }])
          }
          timestampRef.current = timestamp > latestTimestamp ? timestamp : latestTimestamp;
        }
      })
  
      ws.addEventListener('close', ({ code, reason }) => {
        if (reason === "component unmounting") {
          return;
        }
        wsRef.current = getWebSocketClient(room)
        setResetWsListeners(true)
      })
  
      ws.addEventListener('error', event => {
        wsRef.current = getWebSocketClient(room)
        setResetWsListeners(true)
      })

      setResetWsListeners(false)
    }
  }, [name, preambleSent, room, resetWsListeners]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (chatMessage) {
      // setChatMessages([...messages, { name, text: chatMessage }])
      wsRef.current?.send(JSON.stringify({ message: chatMessage }))
      setChatMessage("");
      chatContent.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const newName = event.target.value;
    setChatMessage(newName);
  }

  return <Flex height="100vh">
    <Box maxW='10rem' overflowY='scroll'>
      <Box bg="white" position='sticky' align-self='flex-start' width="100%" top={0}>
        <HStack>
          <Heading size="sm" p={1}>Active Users</Heading>
        </HStack>
      </Box>
      <VStack spacing={0} align='flex-start' p={1}>
        {users.map((val, index) => <Text key={index} isTruncated>{val}</Text>)}
      </VStack>
    </Box>
    <Flex
      flex={1}
      height="100vh"
      direction='column-reverse'
      align='flex-start'
      borderWidth="1px" borderRadius="lg"
      overflowY='scroll'
      ref={chatContent}
    >
      <Box position='sticky' align-self='flex-end' width="100%" bottom={0} bg="white" borderTopWidth="1px">
        <form onSubmit={handleSubmit}>
          <FormControl>
            <FormLabel>Say something, {!!name ? name : 'anonymous'}!</FormLabel>
            <InputGroup>
              <Input onChange={handleChange} value={chatMessage} placeholder='What would you like to say?' ref={chatInput} pr="5rem" />
              <InputRightElement width="5rem">
                <Button type="submit" size='sm'>Submit</Button>
              </InputRightElement>
            </InputGroup>
          </FormControl>
        </form>
      </Box>
      <VStack spacing={0} align='flex-start'>
        {messages.map(({ name, text }, index) => <Fragment key={index}>
          <Text>
            {name === null && <Tag colorScheme='purple'>System</Tag>}
            {name === '' && <Tag>anonymous</Tag>}
            {name !== null && <Tag>{name}</Tag>}
            {" "}{text}
          </Text>
        </Fragment>)}
      </VStack>
    </Flex>
  </Flex>
}

export default ChatRoom
