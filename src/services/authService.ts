import * as jwt from 'jsonwebtoken';
import { User, UserCredential } from '../types';
import prisma from './prismaClient';

export class AuthService {
    private username: string;
    private password: string;
    private readonly jwtSecret = '11223355';

    constructor(username?: string, password?: string) {
        this.username = username || '';
        this.password = password || '';
    }

    private async isValidCredential(): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { username: this.username },
        });
        return !!user && user.password === this.password;
    }

    public async createJwtToken(): Promise<string | null> {
        if (await this.isValidCredential()) {
            const payload = { username: this.username };
            return jwt.sign(payload, this.jwtSecret, { expiresIn: '15m' });
        }
        return null;
    }

    public verifyJwtToken(token: string): boolean {
        if (!token) return false;
        try {
            jwt.verify(token, this.jwtSecret);
            return true;
        } catch {
            return false;
        }
    }

    public verifyTokenFromHeader(token: string): boolean {
        const bearerToken = token.replace('Bearer ', '');
        return this.verifyJwtToken(bearerToken);
    }

    public async getUserDataAndToken(): Promise<{ token: string | null; userMetadata: Omit<User, 'credentials'> }> {
        const dbUser = await prisma.user.findUnique({
            where: { username: this.username },
        });

        if (!dbUser) {
            throw new Error('User not found');
        }

        // Map DB result to User type, omitting credentials
        const userMetadata: Omit<User, 'credentials'> = {
            id: String(dbUser.id),
            fullname: dbUser.fullname,
            username: dbUser.username,
            gender: dbUser.gender,
            age: dbUser.age,
            email: dbUser.email,
            user_type: dbUser.user_type,
        };

        const token = await this.createJwtToken();
        return { token, userMetadata };
    }
}