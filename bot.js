const { Client, GatewayIntentBits, Permissions, MessageActionRow, MessageButton } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('youtube-search-api');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

const prefix = '!';

// Simulação de banco de dados (em uma aplicação real, use um banco de dados verdadeiro)
const userBank = {};

// Fila de músicas
const queue = new Map();

client.on('ready', () => {
  console.log(`Bot está online como ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Comandos existentes
  if (command === 'ping') {
    message.reply('Pong!');
  } else if (command === 'ajuda') {
    const helpMessage = `
    Comandos disponíveis:
    !ping - Verifica se o bot está respondendo
    !kick @usuário - Expulsa um usuário do servidor
    !ban @usuário - Bane um usuário do servidor
    !limpar <número> - Limpa um número específico de mensagens (máx. 100)
    !play <nome da música> - Toca uma música do YouTube
    !skip - Pula para a próxima música na fila
    !stop - Para a reprodução e limpa a fila
    !banco @usuário - Verifica o saldo de um usuário
    !addmoney @usuário [quantidade] - Adiciona dinheiro ao saldo de um usuário (apenas para administradores)
    !doar @usuário [quantidade] - Doa dinheiro para outro usuário
    !apostar - Inicia um jogo de aposta
    !ajuda - Mostra esta mensagem de ajuda
    `;
    message.channel.send(helpMessage);
  } else if (command === 'kick') {
    // ... (código de kick existente)
  } else if (command === 'ban') {
    // ... (código de ban existente)
  } else if (command === 'limpar') {
    // ... (código de limpar existente)
  } else if (command === 'play') {
    executePlay(message, args);
  } else if (command === 'skip') {
    skip(message);
  } else if (command === 'stop') {
    stop(message);
  } else if (command === 'banco') {
    checkBalance(message);
  } else if (command === 'addmoney') {
    addMoney(message, args);
  } else if (command === 'doar') {
    donateMoney(message, args);
  } else if (command === 'apostar') {
    startBet(message);
  }
});

// Funções de música
async function executePlay(message, args) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return message.channel.send('Você precisa estar em um canal de voz para tocar música!');

  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
    return message.channel.send('Preciso de permissões para entrar e falar no seu canal de voz!');
  }

  const searchString = args.join(' ');
  if (!searchString) return message.channel.send('Por favor, forneça o nome de uma música para tocar!');

  try {
    const searchResults = await ytSearch.GetListByKeyword(searchString, false, 1);
    if (!searchResults || searchResults.items.length === 0) {
      return message.channel.send('Não foi possível encontrar a música. Por favor, tente novamente com um nome diferente.');
    }

    const songInfo = searchResults.items[0];
    const song = {
      title: songInfo.title,
      url: `https://www.youtube.com/watch?v=${songInfo.id}`,
    };

    let serverQueue = queue.get(message.guild.id);
    if (!serverQueue) {
      const queueConstruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
      };

      queue.set(message.guild.id, queueConstruct);
      queueConstruct.songs.push(song);

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        queueConstruct.connection = connection;
        play(message.guild, queueConstruct.songs[0]);
      } catch (err) {
        console.log(err);
        queue.delete(message.guild.id);
        return message.channel.send(err);
      }
    } else {
      serverQueue.songs.push(song);
      return message.channel.send(`${song.title} foi adicionada à fila!`);
    }
  } catch (error) {
    console.error(error);
    return message.channel.send('Ocorreu um erro ao tentar reproduzir a música. Por favor, tente novamente mais tarde.');
  }
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(ytdl(song.url, { filter: 'audioonly' }));
  
  player.play(resource);
  serverQueue.connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    play(guild, serverQueue.songs[0]);
  });

  serverQueue.textChannel.send(`Começou a tocar: **${song.title}**`);
}

function skip(message) {
  const serverQueue = queue.get(message.guild.id);
  if (!message.member.voice.channel) return message.channel.send('Você precisa estar em um canal de voz para pular a música!');
  if (!serverQueue) return message.channel.send('Não há música para pular!');
  serverQueue.connection.destroy();
  message.channel.send('Música pulada!');
}

function stop(message) {
  const serverQueue = queue.get(message.guild.id);
  if (!message.member.voice.channel) return message.channel.send('Você precisa estar em um canal de voz para parar a música!');
  if (!serverQueue) return message.channel.send('Não há música tocando!');
  serverQueue.songs = [];
  serverQueue.connection.destroy();
  message.channel.send('Reprodução parada e fila limpa!');
}

// Funções de economia
function checkBalance(message) {
  const user = message.mentions.users.first() || message.author;
  const balance = userBank[user.id] || 0;
  message.channel.send(`${user.username} tem ${balance} moedas.`);
}

function addMoney(message, args) {
  if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return message.reply('Você não tem permissão para usar este comando!');
  }
  const user = message.mentions.users.first();
  if (!user) return message.reply('Por favor, mencione um usuário!');
  const amount = parseInt(args[1]);
  if (isNaN(amount)) return message.reply('Por favor, forneça uma quantidade válida!');
  
  userBank[user.id] = (userBank[user.id] || 0) + amount;
  message.channel.send(`Adicionado ${amount} moedas para ${user.username}. Novo saldo: ${userBank[user.id]}`);
}

function donateMoney(message, args) {
  const user = message.mentions.users.first();
  if (!user) return message.reply('Por favor, mencione um usuário!');
  const amount = parseInt(args[1]);
  if (isNaN(amount)) return message.reply('Por favor, forneça uma quantidade válida!');
  
  if (!userBank[message.author.id] || userBank[message.author.id] < amount) {
    return message.reply('Você não tem saldo suficiente para fazer esta doação!');
  }
  
  userBank[message.author.id] -= amount;
  userBank[user.id] = (userBank[user.id] || 0) + amount;
  message.channel.send(`${message.author.username} doou ${amount} moedas para ${user.username}.`);
}

// Função de aposta
function startBet(message) {
  const games = ['Mines', 'FutNalti', 'Jogo dos Dados'];
  const row = new MessageActionRow()
    .addComponents(
      new MessageButton()
        .setCustomId('mines')
        .setLabel('Mines')
        .setStyle('PRIMARY'),
      new MessageButton()
        .setCustomId('futnalti')
        .setLabel('FutNalti')
        .setStyle('PRIMARY'),
      new MessageButton()
        .setCustomId('dados')
        .setLabel('Jogo dos Dados')
        .setStyle('PRIMARY')
    );

  message.reply({ content: 'Escolha um jogo para apostar:', components: [row] });

  const filter = i => i.user.id === message.author.id;
  const collector = message.channel.createMessageComponentCollector({ filter, time: 15000 });

  collector.on('collect', async i => {
    if (i.customId === 'mines') {
      await i.update({ content: 'Você escolheu Mines. Quantas minas você quer no jogo?', components: [] });
      // Implementar lógica do jogo Mines
    } else if (i.customId === 'futnalti') {
      await i.update({ content: 'Você escolheu FutNalti. Implementação pendente.', components: [] });
      // Implementar lógica do jogo FutNalti
    } else if (i.customId === 'dados') {
      await i.update({ content: 'Você escolheu Jogo dos Dados. Quantos números você quer adicionar?', components: [] });
      // Implementar lógica do Jogo dos Dados
    }
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      message.reply('Tempo esgotado. Nenhum jogo foi selecionado.');
    }
  });
}

// Substitua 'SEU_TOKEN_AQUI' pelo token do seu bot
client.login('Your_Discord_Bot_Token');

console.log("Bot iniciado. Pressione Ctrl+C para encerrar.");