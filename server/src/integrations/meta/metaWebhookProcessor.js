import {normalizeInboundMetaMessage,normalizeMessengerInboundEvent,normalizeMetaStatusEvents} from './messageNormalizer.service.js';
export function processMetaWebhookRecord(db,stored,{storeInboundMessage,updateMessageStatus,logMetaWebhook=()=>{}}) {
        const entries = stored.payload?.entry || [];
        for (const entry of entries) {
          const entryId = entry.id || '';
          logMetaWebhook('info', 'processing entry', {
            recordId: stored.id,
            entryId,
            hasMessagingArray: Array.isArray(entry.messaging),
            changesCount: Array.isArray(entry.changes) ? entry.changes.length : 0
          });

          if (Array.isArray(entry.messaging)) {
            const possibleChannels = db.connectedChannels.filter(item => item.pageId === entryId || item.instagramAccountId === entryId);
            for (const event of entry.messaging) {
              const channel = possibleChannels.find(item => item.channelType === 'facebook')
                || possibleChannels.find(item => item.channelType === 'instagram');
              if (!channel) {
                logMetaWebhook('info', 'no connected messenger/instagram channel matched entry', {
                  entryId,
                  possibleChannels: possibleChannels.length
                });
                throw new Error('No connected channel for Meta entry');
              }
              stored.companyId = channel.companyId;

              const normalizedInbound = normalizeMessengerInboundEvent({
                companyId: channel.companyId,
                channel,
                entry,
                event
              });
              if (normalizedInbound) {
                storeInboundMessage(db, channel.companyId, channel, normalizedInbound);
              }

              const statusEvents = normalizeMetaStatusEvents({ channel, value: null, event });
              statusEvents.forEach(statusItem => updateMessageStatus(db, channel.companyId, statusItem));
            }
          }

          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field !== 'messages') continue;
            const value = change.value || {};
            const phoneNumberId = value.metadata?.phone_number_id || '';
            const channel = db.connectedChannels.find(item => item.phoneNumberId === phoneNumberId && item.companyId);
            if (!channel) {
              logMetaWebhook('info', 'no connected whatsapp channel matched phone number', {
                phoneNumberId,
                changeField: change.field
              });
              throw new Error('No connected WhatsApp channel for phone number');
            }
            stored.companyId = channel.companyId;

            for(const message of value.messages || []) {
              const contact=(value.contacts || []).find(row=>row.wa_id===message.from) || {wa_id:message.from};
              const normalized=normalizeInboundMetaMessage({companyId:channel.companyId,channel,event:entry,value:{...value,messages:[message]},contact});
              if(normalized)storeInboundMessage(db,channel.companyId,channel,normalized);
            }

            const statusEvents = normalizeMetaStatusEvents({ channel, value, event: null });
            statusEvents.forEach(statusItem => updateMessageStatus(db, channel.companyId, statusItem));
          }
        }

}
