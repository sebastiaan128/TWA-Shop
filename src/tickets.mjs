/**
 * Ticket close & delete handlers, extracted for testability.
 */

// Only this role (and higher/admins) can still type after a ticket is closed
const STAFF_ROLE_ID = '1387134682747113473';

export async function handleCloseTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;

  // Deny SEND_MESSAGES for @everyone to lock the channel
  await channel.permissionOverwrites.edit(interaction.guildId, {
    SendMessages: false,
  });

  // Allow the staff role to keep sending messages after close
  await channel.permissionOverwrites.edit(STAFF_ROLE_ID, {
    SendMessages: true,
  });

  // Also deny SendMessages for each individual user overwrite so member-level perms don't override @everyone
  for (const [id, ow] of channel.permissionOverwrites.cache) {
    if (ow.type === 1 && id !== channel.client.user.id) {
      await channel.permissionOverwrites.edit(id, { SendMessages: false });
    }
  }

  // Disable the close button on the original message
  await interaction.message.edit({
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 2,
        label: 'Close Ticket',
        emoji: { name: '🔒' },
        custom_id: 'close_ticket',
        disabled: true,
      }],
    }],
  });

  // Send a locked message with a delete button
  await channel.send({
    content: `🔒 Ticket gesloten door <@${interaction.user.id}>`,
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 4,
        label: 'Delete Ticket',
        emoji: { name: '🗑️' },
        custom_id: 'delete_ticket',
      }],
    }],
  });

  await interaction.editReply({ content: 'Ticket gesloten.' });
}

export async function handleDeleteTicket(interaction, postTranscript) {
  await interaction.deferReply({ ephemeral: true });

  // Only allow staff (ManageChannels permission) to delete tickets
  if (!interaction.memberPermissions?.has('ManageChannels')) {
    await interaction.editReply({ content: 'Je hebt geen toestemming om dit ticket te verwijderen.' });
    return;
  }

  await postTranscript(interaction.channel);
  await interaction.channel.delete();
}
