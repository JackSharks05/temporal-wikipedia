function mapper(key, stats, ctx) {
    const year = key.split(":").at(-1);
    return {
        [year]: stats
    }
}