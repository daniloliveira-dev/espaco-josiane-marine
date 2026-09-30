export function toSessionUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
    };
}

export function toAuthenticatedUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
}