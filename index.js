import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import LibConnection from './lib-connection.js';
import config from './config.js';

// Definir rutas correctas al usar módulos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGINS_PATH = path.join(__dirname, 'plugins');
let plugins = [];

// Variable para saber cuándo el bot ya está completamente listo
let botListo = false;

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

async function cargarPlugins() {
    const inicio = performance.now();
    plugins = [];

    if (!fs.existsSync(PLUGINS_PATH)) {
        if (!config.system.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ La carpeta de complementos no existe, se creará automáticamente...'));
        }
        fs.mkdirSync(PLUGINS_PATH, { recursive: true });
        if (!config.system.omitirRegistrosInnecesarios) {
            console.log(chalk.green('✅ Carpeta creada correctamente\n'));
        }
        return;
    }

    const archivos = fs.readdirSync(PLUGINS_PATH, { withFileTypes: true })
        .filter(archivo => archivo.isFile() && archivo.name.endsWith('.js'))
        .map(archivo => archivo.name);

    if (archivos.length === 0) {
        if (!config.system.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ No se encontraron complementos para cargar\n'));
        }
        return;
    }

    if (!config.system.omitirRegistrosInnecesarios) {
        console.log(chalk.blueBright(`🔄 Cargando ${archivos.length} complementos...`));
    }

    const promesasCarga = archivos.map(async (archivo) => {
        try {
            const rutaCompleta = new URL(`./plugins/${archivo}`, import.meta.url);
            const complemento = await import(rutaCompleta);

            if (complemento.default && typeof complemento.default === 'object' && complemento.default.handler) {
                plugins.push(complemento.default);
                if (!config.system.omitirRegistrosInnecesarios) {
                    console.log(chalk.green(`✅ Complemento cargado: ${archivo}`));
                }
            }
        } catch (error) {
            if (!config.system.omitirRegistrosInnecesarios) {
                console.log(chalk.red(`❌ Error al cargar ${archivo}: ${error.message}`));
            }
        }
    });

    await Promise.all(promesasCarga);

    const tiempoTotal = (performance.now() - inicio).toFixed(2);
    if (!config.system.omitirRegistrosInnecesarios) {
        console.log(chalk.greenBright.bold(`\n✅ Carga completada en ${tiempoTotal}ms | Complementos activos: ${plugins.length}\n`));
    }
}

/**
 * Verifica si el mensaje es válido para ser procesado
 */
function esMensajeValido(mensaje) {
    // No procesar si el bot aún no termina de iniciar o reiniciar
    if (!botListo) return false;

    // No procesar mensajes que no tengan contenido
    if (!mensaje || !mensaje.body) return false;

    // Ignorar mensajes antiguos
    const tiempoActual = Date.now();
    const tiempoMensaje = mensaje.timestamp * 1000;
    if ((tiempoActual - tiempoMensaje) > config.login.tiempoLimiteMensaje) return false;

    // Solo aceptar mensajes que empiecen con el prefijo definido (son comandos)
    if (!mensaje.body.startsWith(config.bot.prefix)) return false;

    return true;
}

/**
 * Obtiene y muestra la información detallada del comando usado
 */
async function obtenerInfoComando(cliente, mensaje) {
    let tipoChat = '';
    let nombreLugar = '';
    let nombreUsuario = '';
    let comandoUsado = mensaje.body.trim();

    // Verificar si es grupo o privado
    if (mensaje.isGroup) {
        tipoChat = '👥 GRUPO';
        const chat = await mensaje.getChat();
        nombreLugar = chat.name || 'Nombre no disponible';
    } else {
        tipoChat = '💬 CHAT PRIVADO';
        nombreLugar = 'Conversación individual';
    }

    // Obtener datos de quien envió el mensaje
    const contacto = await mensaje.getContact();
    nombreUsuario = contacto.name || contacto.pushname || mensaje.author || mensaje.from.replace(/\D/g, '');

    // Mostrar toda la información en consola
    console.log(chalk.magenta('📋 REGISTRO DE COMANDO'));
    console.log(chalk.magenta(`👤 Usuario: ${nombreUsuario}`));
    console.log(chalk.magenta(`${tipoChat}: ${nombreLugar}`));
    console.log(chalk.magenta(`⌨️ Comando: ${comandoUsado}`));
    console.log(chalk.gray('----------------------------------------\n'));
}

/**
 * Busca y ejecuta el comando correspondiente
 */
async function ejecutarComando(mensaje, cliente) {
    const cuerpo = mensaje.body.trim().toLowerCase();
    const prefijo = config.bot.prefix;

    // Recorrer todos los complementos cargados
    for (const complemento of plugins) {
        const datos = complemento;
        if (!datos || !datos.command) continue;

        const comandosPermitidos = Array.isArray(datos.command) ? datos.command : [datos.command];
        const comandoEncontrado = comandosPermitidos.some(cmd => cuerpo === `${prefijo}${cmd.toLowerCase()}`);

        if (comandoEncontrado) {
            // 🛡️ Validaciones de permisos
            const esDueno = config.owner.jid.includes(mensaje.author || mensaje.from);
            const esAdmin = mensaje.isGroup ? (await mensaje.getChat()).participants.some(p => p.id === mensaje.author && p.admin) : false;

            if (datos.owner && !esDueno) {
                return await cliente.sendMessage(mensaje.from, { text: config.messages.owner }, { quoted: mensaje });
            }

            if (datos.admin && !esAdmin) {
                return await cliente.sendMessage(mensaje.from, { text: config.messages.admin }, { quoted: mensaje });
            }

            if (datos.group === true && !mensaje.isGroup) {
                return await cliente.sendMessage(mensaje.from, { text: config.messages.group }, { quoted: mensaje });
            }

            if (datos.group === false && mensaje.isGroup) {
                return await cliente.sendMessage(mensaje.from, { text: '⚠️ Este comando solo funciona en conversación privada' }, { quoted: mensaje });
            }

            // 🚀 Preparar parámetros que recibe el comando
            const parametros = {
                sock: cliente,
                client: cliente,
                from: mensaje.from,
                reply: async (texto) => await cliente.sendMessage(mensaje.from, { text: texto }, { quoted: mensaje }),
                pushName: (await mensaje.getContact()).pushname || 'Usuario',
                plugins: plugins
            };

            // ⚡ Ejecutar función del comando
            try {
                await datos.handler(mensaje, parametros);
            } catch (error) {
                console.log(chalk.red(`⚠️ Error al ejecutar comando: ${error.message}`));
                await cliente.sendMessage(mensaje.from, { text: config.messages.error }, { quoted: mensaje });
            }

            break;
        }
    }
}

/**
 * Procesa cada mensaje de forma eficiente y rápida
 */
async function procesarMensaje(cliente, mensaje) {
    // Primero verificamos si cumple todas las condiciones
    if (!esMensajeValido(mensaje)) return;

    // Mostramos la información detallada en consola
    await obtenerInfoComando(cliente, mensaje);

    // Ejecutar el comando correspondiente
    if (config.system.procesarMensajesEnParalelo) {
        setImmediate(() => ejecutarComando(mensaje, cliente));
    } else {
        await ejecutarComando(mensaje, cliente);
    }
}

/**
 * Inicia todo el funcionamiento del bot con máxima optimización
 */
async function iniciarBot() {
    try {
        // Al iniciar o reiniciar, marcamos que aún no está listo para ignorar mensajes pasados
        botListo = false;

        // Mostramos el título llamativo
        mostrarTitulo();

        // Cargamos los complementos de inmediato
        await cargarPlugins();

        // Iniciamos la conexión
        const conexion = new LibConnection();
        const client = await conexion.connect();

        // Activamos configuraciones internas para mayor velocidad
        client.setMaxListeners(0);

        client.on('ready', () => {
            // Ya está todo listo, ahora sí procesará mensajes nuevos
            botListo = true;
            console.log(chalk.greenBright.bold('🚀 ¡UltraBot funcionando a máxima velocidad! Listo para responder al instante\n'));
        });

        // Reinicio y recarga automática ultrarrápida
        client.on('disconnected', async (motivo) => {
            console.log(chalk.red.bold(`\n🔌 Desconexión detectada: ${motivo}`));
            console.log(chalk.yellow.bold('♻️ Reinicio automático inmediato...\n'));

            // Marcamos como no listo para no leer mensajes antiguos durante el reinicio
            botListo = false;

            // Recarga rápida sin procesos innecesarios
            if (config.system.recargaRapida) {
                await cargarPlugins();
            }

            // Inicio inmediato sin tiempos de espera prolongados
            setImmediate(() => iniciarBot());
        });

        // Recepción y procesamiento de mensajes optimizado
        client.on('message_create', async (mensaje) => {
            setImmediate(() => procesarMensaje(client, mensaje));
        });

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Error del sistema: ${error.message}`));
        console.log(chalk.yellow.bold('🔁 Reinicio automático en 2 segundos...\n'));
        
        botListo = false;
        setTimeout(() => iniciarBot(), 2000);
    }
}

// Inicio inmediato
setImmediate(() => iniciarBot());
