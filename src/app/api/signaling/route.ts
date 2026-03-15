import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Create a global in-memory object to act as our WebRTC signaling server.
// Note: In a real production app on serverless (like Vercel), this would use Redis or Supabase.
// For a college project running locally or on a single instance, this is perfect.
const globalAny: any = global;
if (!globalAny.webrtcRooms) {
  globalAny.webrtcRooms = {};
}

/*
Room Structure:
{
  [roomId: string]: {
    hostOffer?: RTCSessionDescriptionInit,
    guestAnswer?: RTCSessionDescriptionInit,
    hostIceCandidates: RTCIceCandidateInit[],
    guestIceCandidates: RTCIceCandidateInit[],
    topic: string,
    gameMode: string
  }
}
*/

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get('room');

  if (!room) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const roomData = globalAny.webrtcRooms[room] || {
    hostIceCandidates: [],
    guestIceCandidates: []
  };

  return NextResponse.json(roomData);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { room, action, data } = body;

    if (!room || !action) {
      return NextResponse.json({ error: 'Room and action are required' }, { status: 400 });
    }

    if (!globalAny.webrtcRooms[room]) {
      globalAny.webrtcRooms[room] = {
        hostIceCandidates: [],
        guestIceCandidates: []
      };
    }

    const roomRef = globalAny.webrtcRooms[room];

    switch (action) {
      case 'create-room':
        roomRef.topic = data.topic;
        roomRef.gameMode = data.gameMode || 'classic';
        break;
      case 'host-offer':
        roomRef.hostOffer = data;
        break;
      case 'guest-answer':
        roomRef.guestAnswer = data;
        break;
      case 'host-ice':
        roomRef.hostIceCandidates.push(data);
        break;
      case 'guest-ice':
        roomRef.guestIceCandidates.push(data);
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Signaling error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
