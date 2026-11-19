/** Erreur de route agent : statut HTTP et message montré à l'utilisateur (jamais de détail H brut). */
export class ErreurRoute extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}
