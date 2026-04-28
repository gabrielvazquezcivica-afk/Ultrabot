import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import LibConnection from './lib-connection.js';

// Definir rutas correctas al usar módulos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGINS_PATH = path.join(__dirname, 'plugins');
let plugins = new Map();

const CONFIG = {
    omitirRegistrosInnecesarios: true,
    procesarMensajesEnParalelo: true,
    recargaRapida: true,
    limitarProcesos: false
};

function mostrarTitulo() {
    console.log(
        chalk.blueBright.bold(
            figlet.textSync('UltraBot', {
                font: 'Big',
                horizontalLayout: 'default',
                verticalLayout: 'default'
            })
        )
    );
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.greenBright('🤖 BOT DE WHATSAPP - MODO ALTO RENDIMIENTO ACTIVADO'));
    console.log(chalk.greenBright('⚡ Versión: 2.1.0 | Velocidad: MÁXIMA'));
    console.log(chalk.cyan('='.repeat(60)) + '\n');
}

async function cargarPlugins() {
    const inicio = performance.now();
    plugins.clear();

    if (!fs.existsSync(PLUGINS_PATH)) {
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ La carpeta de complementos no existe, se creará automáticamente...'));
        }
        fs.mkdirSync(PLUGINS_PATH, { recursive: true });
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.green('✅ Carpeta creada correctamente\n'));
        }
        return;
    }

    const archivos = fs.readdirSync(PLUGINS_PATH, { withFileTypes: true })
        .filter(archivo => archivo.isFile() && archivo.name.endsWith('.js'))
        .map(archivo => archivo.name);

    if (archivos.length === 0) {
        if (!CONFIG.omitirRegistrosInnecesarios) {
            console.log(chalk.yellow('⚠️ No se encontraron complementos para cargar\n'));
        }
        return;
    }

    if (!CONFIG.omitirRegistrosInnecesarios) {
        console.log(chalk.blueBright(`🔄 Cargando ${archivos.length} complementos...`));
    }

    const promesasCarga = archivos.map(async (archivo) => {
        try {
            const rutaCompleta = new URL(`./plugins/${archivo}`, import.meta.url);
            const complemento = await import(rutaCompleta);

            if (complemento.default?.nombre && typeof complemento.default?.ejecutar === 'function') {
                plugins.set(complemento.default.nombre, complemento.default);
                if (!CONFIG.omitirRegistrosInnecesarios) {
                    console.log(chalk.green(`✅ Complemento cargado: ${archivo}`));
                }
            }
        } catch (error) {
            if (!CONFIG.omitirRegistrosInnecesarios) {
                console.log(chalk.red(`❌ Error al cargar ${archivo}: ${error.message}`));
            }
        }
    });

    await Promise.all(promesasCarga);

    const tiempoTotal = (performance.now() - inicio).toFixed(2);
    if (!CONFIG.omitirRegistrosInnecesarios) {
        console.log(chalk.greenBright.bold(`\n✅ Carga completada en ${tiempoTotal}ms | Complementos activos: ${plugins.size}\n`));
    }
}

async function procesarMensaje(cliente, mensaje) {
    if (!mensaje || !mensaje.body) return;

    if (CONFIG.procesarMensajesEnParalelo) {
        const tareas = [];
        for (const complemento of plugins.values()) {
            tareas.push(
                (async () => {
                    try {
                        await complemento.ejecutar(cliente, mensaje);
                    } catch (err) {
                        if (!CONFIG.omitirRegistrosInnecesarios) {
                            console.log(chalk.red(`⚠️ Error en complemento ${complemento.nombre || 'desconocido'}: ${err.message}`));
                        }
                    }
                })()
            );
        }
        Promise.allSettled(tareas);
    } else {
        for (const complemento of plugins.values()) {
            try {
                await complemento.ejecutar(cliente, mensaje);
            } catch (err) {
                if (!CONFIG.omitirRegistrosInnecesarios) {
                    console.log(chalk.red(`⚠️ Error en complemento ${complemento.nombre || 'desconocido'}: ${err.message}`));
                }
            }
        }
    }
}

async function iniciarBot() {
    try {
        mostrarTitulo();
        await cargarPlugins();

        const conexion = new LibConnection();
        const client = await conexion.connect();

        client.setMaxListeners(0);

        client.on('ready', () => {
            console.log(chalk.greenBright.bold('🚀 ¡UltraBot funcionando a máxima velocidad! Listo para responder al instante\n'));
        });

        client.on('disconnected', async (motivo) => {
            console.log(chalk.red.bold(`\n🔌 Desconexión detectada: ${motivo}`));
            console.log(chalk.yellow.bold('♻️ Reinicio automático inmediato...\n'));

            if (CONFIG.recargaRapida) {
                await cargarPlugins();
            }

            setImmediate(() => iniciarBot());
        });

        client.on('message_create', async (mensaje) => {
            setImmediate(() => procesarMensaje(client, mensaje));
        });

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Error del sistema: ${error.message}`));
        console.log(chalk.yellow.bold('🔁 Reinicio automático en 2 segundos...\n'));
        
        setTimeout(() => iniciarBot(), 2000);
    }
}

setImmediate(() => iniciarBot());
    
