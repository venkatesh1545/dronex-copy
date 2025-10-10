// components/Inbox.tsx

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import EmergencyGroupChat from './EmergencyGroupChat';

function Inbox() {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    async function loadGroups() {
      const { data: { user } } = await supabase.auth.getUser();
      // Find all groups this user belongs to (as member)
      const { data } = await supabase
        .from('group_chat_members')
        .select('group_id, group_chats!inner(id, name, description)')
        .eq('user_id', user.id);
      if (data) {
        setGroups(data.map(x => x.group_chats));
        // Select first as default if available
        if (data.length > 0) setSelectedGroupId(data[0].group_chats.id);
      }
    }
    loadGroups();
  }, []);

  return (
    <div className="flex h-[700px]">
      {/* Inbox Section */}
      <aside className="w-72 border-r bg-background overflow-y-auto">
        <div className="p-4 font-bold text-lg border-b">Inbox</div>
        {groups.length === 0 && <div className="p-4 text-muted-foreground">No group chats found</div>}
        {groups.map((chat) => (
          <div
            key={chat.id}
            onClick={() => setSelectedGroupId(chat.id)}
            className={`cursor-pointer p-4 border-b hover:bg-accent ${selectedGroupId === chat.id ? 'bg-accent font-bold' : ''}`}
          >
            <div className="text-md">{chat.name}</div>
            {chat.description && <div className="text-xs text-muted-foreground">{chat.description}</div>}
          </div>
        ))}
        <div className="p-4">
          <button className="text-sm text-primary underline" onClick={() => alert('TODO: Show group creation modal')}>+ New Group</button>
        </div>
      </aside>
      {/* Chat Box */}
      <main className="flex-1 flex">
        {selectedGroupId ? (
          <EmergencyGroupChat chatId={selectedGroupId} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xl text-muted-foreground">
            Select a group to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
export default Inbox;
