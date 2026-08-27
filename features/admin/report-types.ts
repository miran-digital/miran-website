export type OperationalReport = {
  generatedAt: string;
  commerce: {
    totalOrders: number;
    paidOrders: number;
    pendingPaymentOrders: number;
    cancelledOrders: number;
    legacyCurrencyOrders: number;
    paidRevenueRial: number;
    paidUnits: number;
    customerCount: number;
  };
  catalog: {
    totalProducts: number;
    visibleProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    reservedUnits: number;
  };
  operations: {
    openSupportTickets: number;
    waitingSupportTickets: number;
    pendingReviews: number;
    approvedReviews: number;
    sellerApplications: number;
    eligibleSellers: number;
    auditEventsLast24Hours: number;
    blockedRequestsLast24Hours: number;
    staleReservations: number;
    stalePaymentAttempts: number;
    oldOpenSupportTickets: number;
  };
  dailySales: Array<{
    day: string;
    orderCount: number;
    paidRevenueRial: number;
  }>;
  topProducts: Array<{
    productId: string;
    title: string;
    quantity: number;
    revenueRial: number;
  }>;
};
