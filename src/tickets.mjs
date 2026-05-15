/**
 * Ticket close & delete handlers, extracted for testability.
 */
import { MessageFlags } from 'discord.js';

// Only this role (and higher/admins) can still type after a ticket is closed
const STAFF_ROLE_ID = '1387134682747113473';

export async function handleCloseTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Only allow staff (ManageChannels permission) to delete tickets
  if (!interaction.memberPermissions?.has('ManageChannels')) {
    await interaction.editReply({ content: 'Je hebt geen toestemming om dit ticket te verwijderen.' });
    return;
  }

  // Transcript is best-effort; never block channel deletion on it.
  let transcriptError = null;
  try {
    await postTranscript(interaction.channel);
  } catch (err) {
    transcriptError = err?.message || String(err);
    console.error('postTranscript failed (continuing with delete):', err);
  }

  try {
    await interaction.editReply({
      content: transcriptError
        ? `⚠️ Transcript mislukt: ${transcriptError}\nTicket wordt alsnog verwijderd…`
        : 'Ticket wordt verwijderd…',
    });
  } catch { /* deferReply may have lapsed if transcript took too long */ }

  // Give staff a moment to read the failure before the channel disappears.
  if (transcriptError) {
    await new Promise((r) => setTimeout(r, 8000));
  }

  try {
    await interaction.channel.delete();
  } catch (err) {
    console.error('channel.delete failed:', err);
    try {
      await interaction.followUp({ content: `Kon ticket niet verwijderen: ${err.message}`, flags: MessageFlags.Ephemeral });
    } catch { /* ignore */ }
  }
}
