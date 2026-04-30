import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import LibConnection from './lib/connection.js';
import config from './config.js';

// Rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGINS_PATH = path.join(__dirname, 'plugins');

let plugins = [];
let botListo = false;

// 🔥 CONTROL DE SOCKET
let clientActivo = null;

// 🎨 TÍTULO
function mostrarTitulo() {
    console.log(
        chalk.blueBright.bold(
            figlet.textSync(config.bot.name.replace(/𝐛/g, 'b'), {
                font: 'Big',
                horizontalLayout: 'default',
                verticalLayout: 'default'
            })
        )
    );

    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.greenBright(`🤖 ${config.bot.description}`));
    console.log(chalk.greenBright(`⚡ Versión: ${config.bot.version} | Velocidad: MÁXIMA | Funciones mejoradas`));
    console.log(chalk.cyan('='.repeat(60)) + '\n');
}

// 📦 CARGAR PLUGINS
async function cargarPlugins() {
    const inicio = performance.now();
    plugins = [];

    if (!fs.existsSync(PLUGINS_PATH)) {
        console.log(chalk.yellow('⚠️ La carpeta plugins no existe, creando...'));
        fs.mkdirSync(PLUGINS_PATH, { recursive: true });
        console.log(chalk.green('✅ Carpeta creada\n'));
        return;
    }

    const archivos = fs.readdirSync(PLUGINS_PATH, { withFileTypes: true })
        .filter(a => a.isFile() && a.name.endsWith('.js'))
        .map(a => a.name);

    if (archivos.length === 0) {
        console.log(chalk.yellow('⚠️ No hay plugins\n'));
        return;
    }

    console.log(chalk.blueBright(`🔄 Cargando ${archivos.length} plugins...\n`));

    await Promise.all(
        archivos.map(async (archivo) => {
            try {
                const ruta = new URL(`./plugins/${archivo}`, import.meta.url);
                const plugin = await import(ruta);

                if (plugin.default?.handler) {
                    plugins.push(plugin.default);
                    console.log(chalk.green(`✅ ${archivo}`));
                }
            } catch (err) {
                console.log(chalk.red(`❌ ${archivo}: ${err.message}`));
            }
        })
    );

    console.log(
        chalk.greenBright.bold(
            `\n⚡ Carga completada en ${(performance.now() - inicio).toFixed(2)}ms | Plugins: ${plugins.length}\n`
        )
    );
}

// 🧠 VALIDAR MENSAJE
function esMensajeValido(m) {
    if (!botListo) return false;
    if (!m || !m.message) return false;

    const texto =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        '';

    if (!texto) return false;

    m.body = texto;

    const ahora = Date.now();
    const tiempoMsg = (m.messageTimestamp || 0) * 1000;

    if ((ahora - tiempoMsg) > config.login.tiempoLimiteMensaje) return false;

    if (!texto.startsWith(config.bot.prefix)) return false;

    return true;
}

// 📋 INFO COMANDO
async function obtenerInfoComando(client, m) {
    const esGrupo = m.key.remoteJid.endsWith('@g.us');

    let tipo = esGrupo ? '👥 GRUPO' : '💬 PRIVADO';
    let lugar = 'Chat';

    if (esGrupo) {
        const meta = await client.groupMetadata(m.key.remoteJid).catch(() => null);
        lugar = meta?.subject || 'Grupo';
    }

    const user =
        m.pushName ||
        m.key.participant ||
        m.key.remoteJid.split('@')[0];

    console.log(chalk.magenta('📋 COMANDO'));
    console.log(chalk.magenta(`👤 ${user}`));
    console.log(chalk.magenta(`${tipo}: ${lugar}`));
    console.log(chalk.magenta(`⌨️ ${m.body}`));
    console.log(chalk.gray('----------------------\n'));
}

// ⚡ EJECUTAR COMANDO
async function ejecutarComando(m, client) {
    const body = m.body.toLowerCase().trim();
    const prefijo = config.bot.prefix;
    const remitente = m.key.participant || m.key.remoteJid;
    const esGrupo = m.key.remoteJid.endsWith('@g.us');

    for (const p of plugins) {
        if (!p.command) continue;

        const cmds = Array.isArray(p.command) ? p.command : [p.command];

        if (cmds.some(c => body === prefijo + c.toLowerCase())) {

            const esDueno = config.owner.jid.includes(remitente);

            let esAdmin = false;
            if (esGrupo) {
                const meta = await client.groupMetadata(m.key.remoteJid).catch(() => null);
                esAdmin = meta?.participants.some(x =>
                    x.id === remitente && (x.admin === 'admin' || x.admin === 'superadmin')
                );
            }

            if (p.owner && !esDueno) {
                return client.sendMessage(m.key.remoteJid, { text: config.messages.owner }, { quoted: m });
            }

            if (p.admin && !esAdmin) {
                return client.sendMessage(m.key.remoteJid, { text: config.messages.admin }, { quoted: m });
            }

            try {
                await p.handler(m, {
                    sock: client,
                    client,
                    from: m.key.remoteJid,
                    reply: (txt) => client.sendMessage(m.key.remoteJid, { text: txt }, { quoted: m }),
                    pushName: m.pushName || 'Usuario',
                    plugins
                });
            } catch (err) {
                console.log(chalk.red(`❌ Error: ${err.message}`));
            }

            break;
        }
    }
}

// 📩 PROCESAR MENSAJE
async function procesarMensaje(client, m) {
    if (!esMensajeValido(m)) return;

    await obtenerInfoComando(client, m);

    if (config.system.procesarMensajesEnParalelo) {
        setImmediate(() => ejecutarComando(m, client));
    } else {
        await ejecutarComando(m, client);
    }
}

// 🚀 INICIAR BOT
async function iniciarBot() {
    try {
        if (clientActivo) return;

        botListo = false;

        mostrarTitulo();
        await cargarPlugins();

        const conexion = new LibConnection();
        const client = await conexion.connect();

        clientActivo = client;

        client.ev.on('connection.update', ({ connection }) => {

            if (connection === 'open') {
                botListo = true;
                console.log(chalk.greenBright.bold('\n🚀 UltraBot listo\n'));
            }

            if (connection === 'close') {
                console.log(chalk.red('\n🔌 Desconectado'));
                botListo = false;
                clientActivo = null;
                // ❌ NO reiniciar aquí
            }
        });

        client.ev.on('messages.upsert', ({ messages }) => {
            const m = messages[0];
            if (!m.key.fromMe) {
                procesarMensaje(client, m);
            }
        });

    } catch (err) {
        console.log(chalk.red(`❌ Error: ${err.message}`));
        clientActivo = null;
        setTimeout(iniciarBot, 3000);
    }
}

// START
iniciarBot();
