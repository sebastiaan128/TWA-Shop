import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCloseTicket, handleDeleteTicket } from './tickets.mjs';

function createMockInteraction({ userOverwrites = [], hasManageChannels = false } = {}) {
  const editOverwrite = vi.fn();
  const channelSend = vi.fn();
  const channelDelete = vi.fn();

  // Build permission overwrites cache: each entry is [id, { type, ... }]
  const cache = new Map(userOverwrites.map((id) => [id, { type: 1 }]));

  const interaction = {
    deferReply: vi.fn(),
    editReply: vi.fn(),
    user: { id: '999' },
    guildId: 'guild-1',
    message: { edit: vi.fn() },
    memberPermissions: { has: vi.fn((perm) => hasManageChannels && perm === 'ManageChannels') },
    channel: {
      client: { user: { id: 'bot-id' } },
      permissionOverwrites: { edit: editOverwrite, cache },
      send: channelSend,
      delete: channelDelete,
    },
  };

  return { interaction, editOverwrite, channelSend, channelDelete };
}

describe('handleCloseTicket', () => {
  it('locks @everyone from sending messages', async () => {
    const { interaction, editOverwrite } = createMockInteraction();

    await handleCloseTicket(interaction);

    expect(editOverwrite).toHaveBeenCalledWith('guild-1', { SendMessages: false });
  });

  it('locks individual user overwrites (not the bot)', async () => {
    const { interaction, editOverwrite } = createMockInteraction({
      userOverwrites: ['user-123', 'user-456'],
    });

    await handleCloseTicket(interaction);

    // @everyone + staff role + 2 users = 4 calls
    expect(editOverwrite).toHaveBeenCalledTimes(4);
    expect(editOverwrite).toHaveBeenCalledWith('user-123', { SendMessages: false });
    expect(editOverwrite).toHaveBeenCalledWith('user-456', { SendMessages: false });
  });

  it('does not lock the bot user overwrite', async () => {
    const { interaction, editOverwrite } = createMockInteraction({
      userOverwrites: ['bot-id', 'user-123'],
    });

    await handleCloseTicket(interaction);

    // @everyone + staff role + user-123 only, bot-id skipped
    expect(editOverwrite).toHaveBeenCalledTimes(3);
    expect(editOverwrite).not.toHaveBeenCalledWith('bot-id', expect.anything());
  });

  it('disables the close button on the original message', async () => {
    const { interaction } = createMockInteraction();

    await handleCloseTicket(interaction);

    expect(interaction.message.edit).toHaveBeenCalledWith({
      components: [{
        type: 1,
        components: [expect.objectContaining({
          custom_id: 'close_ticket',
          disabled: true,
        })],
      }],
    });
  });

  it('sends the locked message with a delete button', async () => {
    const { interaction, channelSend } = createMockInteraction();

    await handleCloseTicket(interaction);

    expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Ticket gesloten door'),
      components: [{
        type: 1,
        components: [expect.objectContaining({
          custom_id: 'delete_ticket',
        })],
      }],
    }));
  });

  it('replies with confirmation', async () => {
    const { interaction } = createMockInteraction();

    await handleCloseTicket(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Ticket gesloten.' });
  });
});

describe('handleDeleteTicket', () => {
  it('denies deletion when user lacks ManageChannels', async () => {
    const { interaction } = createMockInteraction({ hasManageChannels: false });
    const postTranscript = vi.fn();

    await handleDeleteTicket(interaction, postTranscript);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Je hebt geen toestemming om dit ticket te verwijderen.',
    });
    expect(postTranscript).not.toHaveBeenCalled();
    expect(interaction.channel.delete).not.toHaveBeenCalled();
  });

  it('allows deletion when user has ManageChannels', async () => {
    const { interaction, channelDelete } = createMockInteraction({ hasManageChannels: true });
    const postTranscript = vi.fn();

    await handleDeleteTicket(interaction, postTranscript);

    expect(postTranscript).toHaveBeenCalledWith(interaction.channel);
    expect(channelDelete).toHaveBeenCalled();
  });

  it('posts transcript before deleting', async () => {
    const { interaction, channelDelete } = createMockInteraction({ hasManageChannels: true });
    const callOrder = [];
    const postTranscript = vi.fn(() => callOrder.push('transcript'));
    channelDelete.mockImplementation(() => callOrder.push('delete'));

    await handleDeleteTicket(interaction, postTranscript);

    expect(callOrder).toEqual(['transcript', 'delete']);
  });
});
