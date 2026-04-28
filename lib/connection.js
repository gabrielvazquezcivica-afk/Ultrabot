import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.socket = null;
    }

    async connect() {
        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.phoneNumber = await new Promise(resolve => {
            rl.question(
                chalk.blue('📱 Ingresa tu número con código de país: '),
                num => {
                    rl.close();
                    resolve(num.replace(/\D/g, ''));
                }
            );
        });

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            // ❗ OPCIÓN OBSOLETA COMENTADA PARA QUE NO SALGA EL AVISO
            // printQRInTerminal: !config.login.pairing,
            syncFullHistory: false,
            logger: pino({ level: 'silent' })
        });

        if (config.login.pairing) {
            let codigo = await this.socket.requestPairingCode(this.phoneNumber);
            console.log(chalk.magenta.bold(`\n🔑 Tu código de vinculación es: ${chalk.white.bgBlack.bold(` ${codigo} `)}
            
